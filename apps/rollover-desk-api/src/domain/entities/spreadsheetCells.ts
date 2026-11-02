import { isIsoDate } from './dates';

/** A spreadsheet cell after the reader: text, a number, a true date cell, or empty. */
export type Cell = string | number | { date: string } | null;

export type Parsed<T> =
  | { kind: 'value'; value: T; unusual?: string }
  | { kind: 'missing'; note?: string }
  | { kind: 'invalid'; code: 'invalid_number' | 'invalid_date' | 'ambiguous_date'; reason: string };

const BLANK = new Set(['', '-', '--', 'n/a', 'na', 'none', 'null']);
const PENDING = new Set(['tbd', 'pending', 'unknown']);
const MAX_NUMBER = 1e12;
const MAX_NOTICE_MONTHS = 120;
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

export function cellText(cell: Cell): string {
  if (cell === null) return '';
  if (typeof cell === 'object') return cell.date;
  return String(cell).trim();
}

/** True for text that stands in for a value rather than being one, such as "N/A" or "TBD". */
export function isPlaceholder(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return BLANK.has(lower) || PENDING.has(lower);
}

const FORMULA_ERROR =
  /^#(NO_STORED_VALUE|INVALID_DATE|REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!)$/i;

/** A formula that failed, or has no stored result. Its text must never be read as a name. */
export const isFormulaError = (text: string): boolean => FORMULA_ERROR.test(text.trim());

/** Dollars to whole cents, rounding half up despite binary fractions: 0.145 is 15 cents, not 14. */
export const toCents = (dollars: number): number => Math.round(Number((dollars * 100).toPrecision(14)));

const missing = (cell: Cell): Parsed<never> | null => {
  const text = cellText(cell).toLowerCase();
  if (BLANK.has(text)) return { kind: 'missing' };
  if (PENDING.has(text)) return { kind: 'missing', note: `Recorded as "${cellText(cell)}"` };
  return null;
};

const notANumber = (text: string): Parsed<never> => ({
  kind: 'invalid',
  code: 'invalid_number',
  reason: `"${text}" is not a number`,
});

/** Numbers with $, commas and a trailing unit. Accounting brackets are negative, which callers reject. */
export function parseNumber(cell: Cell): Parsed<number> {
  const blank = missing(cell);
  if (blank) return blank;
  const text = cellText(cell);
  if (typeof cell === 'number') {
    return Number.isFinite(cell) && Math.abs(cell) <= MAX_NUMBER
      ? { kind: 'value', value: cell }
      : notANumber(text);
  }
  const m = /^(\()?\s*\$?\s*(-?)([\d,]*\.?\d+)\s*(?:\/?\s*(?:sf|rsf|sq\.?\s*ft\.?|usd))?\s*(\))?$/i.exec(
    text,
  );
  if (!m || !!m[1] !== !!m[4] || (m[1] && m[2])) return notANumber(text);
  if (m[3]!.includes(',') && !/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(m[3]!)) return notANumber(text);
  const value = Number(m[3]!.replaceAll(',', ''));
  if (!Number.isFinite(value) || value > MAX_NUMBER) return notANumber(text);
  return { kind: 'value', value: m[1] || m[2] ? -value : value };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
const monthOf = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

const notADate = (text: string): Parsed<never> => ({
  kind: 'invalid',
  code: 'invalid_date',
  reason: `"${text}" is not a calendar date`,
});

const checked = (text: string, value: string, unusual?: string): Parsed<string> => {
  const year = Number(value.slice(0, 4));
  if (!isIsoDate(value) || year < MIN_YEAR || year > MAX_YEAR) return notADate(text);
  return { kind: 'value', value, ...(unusual ? { unusual } : {}) };
};

const SLASH_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})$/;

/** True for text like 03/04/2029, which reads as a valid date in either day and month order. */
export function isDayMonthAmbiguous(cell: Cell): boolean {
  const m = typeof cell === 'string' ? SLASH_DATE.exec(cell.trim()) : null;
  return !!m && +m[1]! <= 12 && +m[2]! <= 12 && m[1] !== m[2];
}

// Excel serials for 1950 to 2100. Outside this, a bare number in a date column is not treated as a date.
const SERIAL_MIN = 18_264;
const SERIAL_MAX = 73_415;

/** Reads US-style dates. A date is never guessed: anything without a clear day, month and year is refused. */
export function parseDate(cell: Cell): Parsed<string> {
  const blank = missing(cell);
  if (blank) return blank;
  if (cell !== null && typeof cell === 'object') return checked(cell.date, cell.date);
  const text = cellText(cell);
  const asNumber = typeof cell === 'number' ? cell : /^\d{5}$/.test(text) ? Number(text) : null;
  if (asNumber !== null) {
    if (!Number.isInteger(asNumber) || asNumber < SERIAL_MIN || asNumber > SERIAL_MAX) {
      return { kind: 'invalid', code: 'invalid_date', reason: `${text} is not a date` };
    }
    return {
      kind: 'value',
      value: new Date(Date.UTC(1899, 11, 30) + asNumber * 86_400_000).toISOString().slice(0, 10),
    };
  }
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?$/.exec(text))) {
    return checked(text, iso(+m[1]!, +m[2]!, +m[3]!));
  }
  if ((m = SLASH_DATE.exec(text))) {
    const [first, second, year] = [+m[1]!, +m[2]!, fullYear(m[3]!)];
    if (first > 12 && second <= 12) {
      return checked(text, iso(year, second, first), `"${text}" is day-first, unlike the US dates expected`);
    }
    return checked(text, iso(year, first, second));
  }
  if ((m = new RegExp(`^(\\d{1,2})[ -]${MONTH}[ ,-]*(\\d{4}|\\d{2})$`, 'i').exec(text))) {
    return checked(text, iso(fullYear(m[3]!), monthOf(m[2]!), +m[1]!));
  }
  if ((m = new RegExp(`^${MONTH} (\\d{1,2}),? (\\d{4})$`, 'i').exec(text))) {
    return checked(text, iso(+m[3]!, monthOf(m[1]!), +m[2]!));
  }
  if (
    new RegExp(`^${MONTH}[ -]*(\\d{4}|\\d{2})$`, 'i').test(text) ||
    /^\d{1,2}\/\d{4}$/.test(text) ||
    /^\d{4}$/.test(text)
  ) {
    return {
      kind: 'invalid',
      code: 'ambiguous_date',
      reason: `"${text}" has no day, and a day won't be assumed`,
    };
  }
  return { kind: 'invalid', code: 'invalid_date', reason: `"${text}" is not a recognised date` };
}

/** Whole months only. "180 days" isn't a whole number of calendar months, so it is not converted. */
export function parseNoticeMonths(cell: Cell): Parsed<number> {
  const blank = missing(cell);
  if (blank) return blank;
  const m = /^(\d+)\s*(?:m|mo|mos|mths?|months?)?$/i.exec(cellText(cell));
  if (!m || Number(m[1]) > MAX_NOTICE_MONTHS) {
    return {
      kind: 'invalid',
      code: 'invalid_number',
      reason: `"${cellText(cell)}" is not a number of months`,
    };
  }
  return { kind: 'value', value: Number(m[1]) };
}
