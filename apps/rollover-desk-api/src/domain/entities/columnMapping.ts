import { type Cell, cellText } from './spreadsheetCells';

export const LEASE_FIELDS = [
  'suite',
  'tenant',
  'area',
  'annualRent',
  'monthlyRent',
  'annualRentPsf',
  'monthlyRentPsf',
  'commencement',
  'expiration',
  'noticeMonths',
  'stepDate',
  'stepRent',
  'rentUnknownBasis',
] as const;

export type LeaseField = (typeof LEASE_FIELDS)[number];

const SYNONYMS: Record<LeaseField, string[]> = {
  suite: ['suite', 'suite no', 'unit', 'unit no', 'space', 'ste'],
  tenant: ['tenant', 'tenant name', 'occupant', 'lessee', 'tenant dba'],
  area: ['sf', 'rsf', 'nra', 'sq ft', 'sqft', 'square feet', 'area', 'area sf', 'leased sf', 'rentable sf'],
  annualRent: [
    'annual rent',
    'annual base rent',
    'ann base rent',
    'base rent annual',
    'annual base',
    'rent annual',
  ],
  monthlyRent: [
    'monthly rent',
    'monthly base rent',
    'mo base rent',
    'base rent monthly',
    'monthly base',
    'rent monthly',
  ],
  annualRentPsf: [
    'annual psf',
    'annual rent psf',
    'rent psf annual',
    'psf annual',
    'annual base rent psf',
    'ann psf',
  ],
  monthlyRentPsf: ['monthly psf', 'monthly rent psf', 'rent psf monthly', 'psf monthly', 'mo psf'],
  commencement: [
    'commencement',
    'commencement date',
    'start',
    'start date',
    'lease start',
    'comm date',
    'lease from',
  ],
  expiration: [
    'expiration',
    'expiration date',
    'expiry',
    'expires',
    'lease end',
    'lease exp',
    'end date',
    'lease to',
  ],
  noticeMonths: ['notice', 'notice months', 'notice mos', 'notice period', 'renewal notice'],
  stepDate: ['next step date', 'step date', 'rent step date', 'escalation date'],
  // A step rent must state its period; a plain "step rent" falls to rentUnknownBasis and blocks.
  stepRent: ['next step annual rent', 'step annual rent', 'annual step rent'],
  // A rent with no stated period can't be read as annual or monthly without guessing.
  rentUnknownBasis: ['rent', 'base rent', 'current rent', 'contract rent', 'psf', 'rent psf'],
};

const REQUIRED: LeaseField[] = ['suite', 'tenant', 'area', 'expiration'];
const RENT_FIELDS: LeaseField[] = ['annualRent', 'monthlyRent', 'annualRentPsf', 'monthlyRentPsf'];

const AREA_UNIT = String.raw`(?:sf|rsf|sq\.?\s*ft\.?)`;
const PER_AREA = new RegExp(String.raw`\$\s*/\s*${AREA_UNIT}|/\s*${AREA_UNIT}|\bper\s+${AREA_UNIT}`, 'g');

export function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(PER_AREA, ' psf ')
    .replace(/#/g, ' no ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface ColumnMatch {
  field: LeaseField;
  confidence: number;
}

const NOT_PER_AREA: LeaseField[] = ['annualRent', 'monthlyRent', 'area'];

/** Words meaning this column is something else, so a partial match on "rent" or "notice" would be wrong. */
const OTHER_MEANING = new Set([
  'market',
  'increase',
  'cam',
  'prior',
  'proposed',
  'days',
  'deposit',
  'recovery',
  'recoveries',
  'tax',
  'taxes',
  'nnn',
  'opex',
  'option',
  'free',
  'abatement',
  'parking',
  'storage',
]);

/** An exact synonym is certain. Otherwise the longest synonym whose words all appear, flagged for review. */
export function matchHeader(header: string): ColumnMatch | null {
  const normal = normalizeHeader(header);
  if (!normal) return null;
  const words = new Set(normal.split(' '));
  const excluded = [...words].some((w) => OTHER_MEANING.has(w));
  let best: { field: LeaseField; length: number } | null = null;
  for (const field of LEASE_FIELDS) {
    for (const synonym of SYNONYMS[field]) {
      if (synonym === normal) return { field, confidence: 1 };
      const parts = synonym.split(' ');
      if (excluded || (words.has('psf') && NOT_PER_AREA.includes(field))) continue;
      if (parts.every((p) => words.has(p)) && (!best || parts.length > best.length)) {
        best = { field, length: parts.length };
      }
    }
  }
  return best && { field: best.field, confidence: 0.8 };
}

export interface MappedColumn {
  index: number;
  header: string;
  field: LeaseField | null;
  confidence: number;
  /** The analyst chose this mapping. */
  overridden: boolean;
}

export interface HeaderLocation {
  /** First data row, 0-based. */
  dataStart: number;
  /** 0-based index of the last header row. */
  headerRow: number;
  headers: string[];
  matched: number;
}

const headersOf = (rows: Cell[][], at: number, span: number): string[] => {
  const width = Math.max(...rows.slice(at, at + span).map((r) => r.length), 0);
  return Array.from({ length: width }, (_, col) => {
    const parts: string[] = [];
    for (let r = at; r < at + span; r += 1) {
      const text = cellText(rows[r]?.[col] ?? null);
      if (text && !parts.includes(text)) parts.push(text);
    }
    return parts.join(' ');
  });
};

/** Distinct fields matched, and how sure, so an exact header beats the same words with a title stuck on. */
const score = (headers: string[]) => {
  const best = new Map<LeaseField, number>();
  for (const h of headers) {
    const m = matchHeader(h);
    if (m) best.set(m.field, Math.max(best.get(m.field) ?? 0, m.confidence));
  }
  return { matched: best.size, sure: [...best.values()].reduce((n, c) => n + c, 0) };
};

const SCAN_ROWS = 25;
const MIN_MATCHED = 3;

/** A real second header line holds only words. A data row always has a number, a date or a suite. */
const couldContinueHeader = (row: Cell[] = []) =>
  row.every((c) => c === null || (typeof c === 'string' && !/\d/.test(c)));

/** Finds the header among title rows, including one split over two rows. Null when nothing looks like one. */
export function locateHeader(rows: Cell[][]): HeaderLocation | null {
  let best: (HeaderLocation & { sure: number }) | null = null;
  for (let at = 0; at < Math.min(rows.length, SCAN_ROWS); at += 1) {
    for (const span of [1, 2]) {
      if (span === 2 && !couldContinueHeader(rows[at + 1])) continue;
      const headers = headersOf(rows, at, span);
      const { matched, sure } = score(headers);
      if (matched >= MIN_MATCHED && (!best || sure > best.sure)) {
        best = { dataStart: at + span, headerRow: at + span - 1, headers, matched, sure };
      }
    }
  }
  return best;
}

export interface MappingProblem {
  code:
    | 'missing_column'
    | 'column_conflict'
    | 'ambiguous_rent_basis'
    | 'low_confidence_mapping'
    | 'no_notice_column';
  severity: 'blocking' | 'warning';
  message: string;
  column?: string;
}

export function mapColumns(
  headers: string[],
  overrides: Record<number, LeaseField | null> = {},
): { columns: MappedColumn[]; problems: MappingProblem[] } {
  const columns = headers.map((header, index): MappedColumn => {
    if (index in overrides) {
      return { index, header, field: overrides[index] ?? null, confidence: 1, overridden: true };
    }
    const match = matchHeader(header);
    return {
      index,
      header,
      field: match?.field ?? null,
      confidence: match?.confidence ?? 0,
      overridden: false,
    };
  });
  const problems: MappingProblem[] = [];

  for (const field of LEASE_FIELDS) {
    const claims = columns.filter((c) => c.field === field);
    if (claims.length < 2) continue;
    const top = Math.max(...claims.map((c) => c.confidence));
    const winners = claims.filter((c) => c.confidence === top);
    if (winners.length > 1) {
      problems.push({
        code: 'column_conflict',
        severity: 'blocking',
        message: `Columns ${winners.map((c) => `"${c.header}"`).join(' and ')} both look like ${field}. Choose one.`,
      });
    }
    // Neither of a tie is used: picking one would be a guess.
    for (const c of claims) if (c.confidence < top || winners.length > 1) c.field = null;
  }

  for (const c of columns) {
    if (c.field === 'rentUnknownBasis') {
      problems.push({
        code: 'ambiguous_rent_basis',
        severity: 'blocking',
        column: c.header,
        message: `"${c.header}" doesn't say whether rent is annual, monthly or per SF. Choose one.`,
      });
    } else if (c.field && c.confidence < 1) {
      problems.push({
        code: 'low_confidence_mapping',
        severity: 'warning',
        column: c.header,
        message: `"${c.header}" was read as ${c.field}. Please confirm.`,
      });
    }
  }

  const has = (f: LeaseField) => columns.some((c) => c.field === f);
  for (const field of REQUIRED) {
    if (!has(field))
      problems.push({ code: 'missing_column', severity: 'blocking', message: `No ${field} column found.` });
  }
  if (!RENT_FIELDS.some(has) && !has('rentUnknownBasis')) {
    problems.push({ code: 'missing_column', severity: 'blocking', message: 'No rent column found.' });
  }
  if (!has('noticeMonths')) {
    problems.push({
      code: 'no_notice_column',
      severity: 'warning',
      message: 'No notice column found, so notice dates will show as absent.',
    });
  }
  return { columns, problems };
}
