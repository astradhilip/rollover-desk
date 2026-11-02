import { type LeaseField, locateHeader, type MappedColumn, mapColumns } from './columnMapping';
import { daysBetween, yearOf } from './dates';
import type { Lease, RentStep } from './Lease';
import {
  type Cell,
  cellText,
  isDayMonthAmbiguous,
  isFormulaError,
  isPlaceholder,
  parseDate,
  parseNoticeMonths,
  parseNumber,
  type Parsed,
  toCents,
} from './spreadsheetCells';

export type IssueSeverity = 'blocking' | 'warning';

export interface IntakeIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  /** 1-based row in the source sheet, as the analyst sees it. Absent for file-level issues. */
  row?: number;
  column?: string;
  suite?: string;
}

/** A lease read from a file, with where it came from. */
export interface ParsedLease extends Lease {
  sourceRow: number;
  commencementDate: string | null;
}

export interface SkippedRow {
  row: number;
  reason: 'subtotal' | 'note' | 'unattached';
  text: string;
}

export interface IntakeResult {
  columns: MappedColumn[];
  headerRow: number | null;
  leases: ParsedLease[];
  skippedRows: SkippedRow[];
  issues: IntakeIssue[];
  /** False until no blocking issue remains. */
  canConfirm: boolean;
}

const SUMMARY =
  /^(((grand|property|building|portfolio|occupied|vacant|leased|floor\s+\S+|wing\s+\S+|\S+\s+wing)\s+)?(sub-?\s*)?totals?|.*\bsub-?\s*totals?|(weighted\s+)?(average|avg)|sum|occupancy)\s*:?$/i;
const GRAND = /grand|property|^totals?\s*:?$/i;
const VACANT =
  /^[-<(*\s]*(vacant|vacancy|available|unleased|not\s+leased)([\s/-]+(suite|space|unit|spec\b.*|available|vacant|\d.*))?[->)*\s]*$/i;
const MAYBE_VACANT = /^(vacant|vacancy|available|unleased|not\s+leased)\b/i;
const MTM = /^(mtm|m-t-m|m\/m|month[\s-]*to[\s-]*month|holdover|hold[\s-]*over)$/i;
const PER_AREA_CELL = /\/\s*(sf|rsf|sq)|\bpsf\b/i;
const RANGE_YEARS = 30;
const PSF_MIN_CENTS = 100;
const PSF_MAX_CENTS = 50_000;
const RENT_TOLERANCE_CENTS = 100;
const AREA_TOLERANCE = 1;

const RENT_FIELDS = ['annualRent', 'monthlyRent', 'annualRentPsf', 'monthlyRentPsf'] as const;

interface RowContext {
  get: (field: LeaseField) => Cell;
  has: (field: LeaseField) => boolean;
  key: string;
  issue: (code: string, severity: IssueSeverity, message: string, field?: LeaseField) => void;
  read: <T>(field: LeaseField, parsed: Parsed<T>, label: string, warnIfBlank: boolean) => T | null;
}

/** Turns a messy rent roll grid into leases and issues. Nothing is defaulted, and every row is accounted for. */
export function parseRentRoll(
  rows: Cell[][],
  asOf: string,
  overrides: Record<number, LeaseField | null> = {},
): IntakeResult {
  const header = locateHeader(rows);
  if (!header) {
    return {
      columns: [],
      headerRow: null,
      leases: [],
      skippedRows: [],
      issues: [
        { code: 'no_header', severity: 'blocking', message: 'No header row found in the first 25 rows.' },
      ],
      canConfirm: false,
    };
  }
  const { columns, problems } = mapColumns(header.headers, overrides);
  const issues: IntakeIssue[] = problems.map((p) => ({ ...p }));
  const colOf = new Map<LeaseField, MappedColumn>();
  for (const c of columns) if (c.field) colOf.set(c.field, c);

  const leases: ParsedLease[] = [];
  const skippedRows: SkippedRow[] = [];
  const totals: { row: number; label: string; area: number | null; rentCents: number | null }[] = [];
  const firstSuiteRow = new Map<string, number>();
  let dayFirstDates = 0;
  let eitherWayDates = 0;

  rows.slice(header.dataStart).forEach((cells, offset) => {
    const row = header.dataStart + offset + 1;
    const filled = cells.map(cellText).filter(Boolean);
    if (filled.length === 0) return;

    const has = (field: LeaseField) => colOf.has(field);
    const get = (field: LeaseField): Cell => {
      const c = colOf.get(field);
      return c ? (cells[c.index] ?? null) : null;
    };
    const rawSuite = cellText(get('suite'));
    const rawTenant = cellText(get('tenant'));

    // A row with both a suite and a tenant is a lease, even for a tenant called "Total".
    if (!(rawSuite && rawTenant) && [rawSuite, rawTenant, filled[0]!].some((t) => SUMMARY.test(t))) {
      const label = [rawSuite, rawTenant, filled[0]!].find((t) => SUMMARY.test(t))!;
      skippedRows.push({ row, reason: 'subtotal', text: label });
      if (GRAND.test(label)) totals.push({ row, label, ...readTotal(get, has) });
      return;
    }

    if (new Set(filled).size === 1) {
      // Merged banners repeat one value across the row. A lone word in the tenant column might be a tenant.
      const loneTenant = filled.length === 1 && rawTenant !== '';
      if (/[a-z]{2,}/i.test(filled[0]!) && !loneTenant) {
        skippedRows.push({ row, reason: 'note', text: filled[0]! });
        return;
      }
    }
    if ((!rawSuite && !rawTenant) || new Set(filled).size === 1) {
      skippedRows.push({ row, reason: 'unattached', text: filled.join(' | ') });
      issues.push({
        code: 'unattached_row',
        severity: 'warning',
        row,
        message: `Row ${row} has data that wasn't attached to a lease: ${filled.join(' | ')}`,
      });
      return;
    }

    const suiteBroken = isFormulaError(rawSuite);
    const suite = rawSuite && !suiteBroken ? rawSuite : null;
    const key = suite ?? `row-${row}`;

    const issue: RowContext['issue'] = (code, severity, message, field) =>
      issues.push({
        code,
        severity,
        message,
        row,
        ...(field && colOf.get(field) ? { column: colOf.get(field)!.header } : {}),
        ...(suite ? { suite } : {}),
      });

    /** Unreadable blocks confirmation. Blank stays unrecorded, with a warning on an occupied row. */
    const read: RowContext['read'] = (field, parsed, label, warnIfBlank) => {
      if (parsed.kind === 'value') {
        if (parsed.unusual) issue('unusual_date_format', 'warning', `${label}: ${parsed.unusual}.`, field);
        return parsed.value;
      }
      if (parsed.kind === 'invalid') {
        issue(parsed.code, 'blocking', `${label} for suite ${key}: ${parsed.reason}.`, field);
        return null;
      }
      if (warnIfBlank || parsed.note) {
        const note = parsed.note ? ` (${parsed.note})` : '';
        issue('missing_value', 'warning', `${label} for suite ${key} is not recorded${note}.`, field);
      }
      return null;
    };
    const readDate = (field: LeaseField, label: string, warnIfBlank: boolean) => {
      const parsed = parseDate(get(field));
      if (parsed.kind === 'value' && parsed.unusual) dayFirstDates += 1;
      if (isDayMonthAmbiguous(get(field))) eitherWayDates += 1;
      return read(field, parsed, label, warnIfBlank);
    };
    const context: RowContext = { get, has, key, issue, read };

    if (suiteBroken)
      issue('formula_error', 'blocking', `Suite on row ${row} is a failed formula (${rawSuite}).`, 'suite');
    else if (!suite) issue('missing_suite', 'blocking', `Row ${row} has a tenant but no suite.`, 'suite');

    const isVacant = VACANT.test(rawTenant);
    const occupied = !isVacant;
    if (occupied && MAYBE_VACANT.test(rawTenant)) {
      issue(
        'possible_vacancy',
        'warning',
        `Tenant "${rawTenant}" on suite ${key} may mean the suite is vacant. It was read as a tenant.`,
        'tenant',
      );
    }

    let area = nonNegative(read('area', parseNumber(get('area')), 'Area', true), 'area', 'Area', context);
    if (area === 0) {
      issue(
        'missing_value',
        'warning',
        `Area for suite ${key} is zero, so it is treated as not recorded.`,
        'area',
      );
      area = null;
    }

    const rent = occupied ? readRent(area, context) : null;

    const expirationCell = get('expiration');
    const isMonthToMonth = occupied && MTM.test(cellText(expirationCell));
    const expirationDate = !occupied || isMonthToMonth ? null : readDate('expiration', 'Expiration', true);
    const commencementDate = occupied ? readDate('commencement', 'Commencement', false) : null;

    let noticeMonths: number | null = null;
    if (occupied && !isMonthToMonth) {
      const notice = parseNoticeMonths(get('noticeMonths'));
      if (notice.kind === 'value') noticeMonths = notice.value;
      if (notice.kind === 'invalid' || (notice.kind === 'missing' && notice.note)) {
        const why = notice.kind === 'invalid' ? notice.reason : notice.note;
        issue(
          'unparsed_notice',
          'warning',
          `Notice term for suite ${key}: ${why}. Its notice date will show as absent.`,
          'noticeMonths',
        );
      }
    }

    if (isVacant) warnVacantLeaseData(context);

    const outOfRange = (date: string | null, label: string, field: LeaseField) => {
      if (date && Math.abs(yearOf(date) - yearOf(asOf)) > RANGE_YEARS) {
        issue(
          'date_out_of_range',
          'warning',
          `${label} for suite ${key} is in ${yearOf(date)}, which looks mistyped.`,
          field,
        );
      }
    };
    outOfRange(expirationDate, 'Expiration', 'expiration');
    outOfRange(commencementDate, 'Commencement', 'commencement');
    if (commencementDate && expirationDate && daysBetween(commencementDate, expirationDate) < 0) {
      issue(
        'date_order',
        'blocking',
        `Suite ${key} expires (${expirationDate}) before it commences (${commencementDate}).`,
        'expiration',
      );
    }
    if (expirationDate && daysBetween(asOf, expirationDate) < 0) {
      issue(
        'expired_lease',
        'warning',
        `Suite ${key} expired on ${expirationDate} and has not been marked as holdover.`,
        'expiration',
      );
    }
    if (rent !== null && area) {
      const psf = rent / area;
      if (psf < PSF_MIN_CENTS || psf > PSF_MAX_CENTS) {
        issue(
          'rent_out_of_range',
          'warning',
          `Suite ${key} works out to $${(psf / 100).toFixed(2)}/SF a year. Check the rent and its period.`,
        );
      }
    }

    const rentSteps = occupied ? readStep(readDate('stepDate', 'Rent step date', false), context) : [];

    if (suite) {
      const first = firstSuiteRow.get(suite);
      if (first !== undefined) {
        issue('duplicate_suite', 'blocking', `Suite ${suite} appears on rows ${first} and ${row}.`, 'suite');
      } else {
        firstSuiteRow.set(suite, row);
      }
    }

    let tenantName: string | null = null;
    if (occupied) {
      if (isFormulaError(rawTenant)) {
        issue(
          'formula_error',
          'blocking',
          `Tenant for suite ${key} is a failed formula (${rawTenant}).`,
          'tenant',
        );
      } else if (!rawTenant || isPlaceholder(rawTenant)) {
        issue('missing_value', 'warning', `Tenant for suite ${key} is not recorded.`, 'tenant');
      } else {
        tenantName = rawTenant;
      }
    }

    leases.push({
      id: `row-${row}`,
      sourceRow: row,
      suite: key,
      tenantName,
      status: occupied ? 'occupied' : 'vacant',
      areaSf: area,
      annualRentCents: rent,
      commencementDate,
      expirationDate,
      isMonthToMonth,
      noticeMonths,
      rentSteps,
    });
  });

  if (dayFirstDates > 0 && eitherWayDates > 0) {
    issues.push({
      code: 'mixed_date_order',
      severity: 'blocking',
      message: `${dayFirstDates} date(s) are day-first, so ${eitherWayDates} date(s) like 03/04/2029 could be read either way. Correct the file.`,
    });
  }
  checkTotals(totals, leases, issues);
  return {
    columns,
    headerRow: header.headerRow + 1,
    leases,
    skippedRows,
    issues,
    canConfirm: !issues.some((i) => i.severity === 'blocking'),
  };
}

function nonNegative(
  value: number | null,
  field: LeaseField,
  label: string,
  { key, issue }: RowContext,
): number | null {
  if (value !== null && value < 0) {
    issue('invalid_number', 'blocking', `${label} for suite ${key} is negative.`, field);
    return null;
  }
  return value;
}

/** Any rent, date or notice on a vacant row contradicts "vacant", so it is reported rather than discarded quietly. */
function warnVacantLeaseData({ get, key, issue }: RowContext) {
  const shows = RENT_FIELDS.some((f) => {
    const parsed = parseNumber(get(f));
    return parsed.kind !== 'missing' && !(parsed.kind === 'value' && parsed.value === 0);
  });
  if (shows)
    issue('vacant_with_rent', 'warning', `Suite ${key} is marked vacant but shows rent, which was ignored.`);
  const dated = (['commencement', 'expiration', 'noticeMonths'] as const).some((f) => {
    const text = cellText(get(f));
    return text && !isPlaceholder(text);
  });
  if (dated)
    issue(
      'vacant_with_lease_data',
      'warning',
      `Suite ${key} is marked vacant but shows lease dates or notice, which were ignored.`,
    );
}

/**
 * Annual rent in cents, from the first rent column in the order annual, monthly, annual per SF, monthly per SF.
 * Every rent column present is read, so an unreadable or disagreeing one is reported. Others never fill a blank.
 */
function readRent(area: number | null, context: RowContext): number | null {
  const { get, has, key, issue, read } = context;
  const present = RENT_FIELDS.filter(has);
  const results = present.map((field) => {
    const flat = field === 'annualRent' || field === 'monthlyRent';
    if (flat && PER_AREA_CELL.test(cellText(get(field)))) {
      issue(
        'invalid_number',
        'blocking',
        `Rent for suite ${key} is "${cellText(get(field))}", per SF in a column that isn't.`,
        field,
      );
      return { field, recorded: true, cents: null };
    }
    const value = nonNegative(read(field, parseNumber(get(field)), 'Rent', false), field, 'Rent', context);
    if (value === null)
      return {
        field,
        recorded: cellText(get(field)) !== '' && !isPlaceholder(cellText(get(field))),
        cents: null,
      };
    const factor = field === 'monthlyRent' || field === 'monthlyRentPsf' ? 12 : 1;
    if (flat) return { field, recorded: true, cents: toCents(value * factor) };
    return {
      field,
      recorded: true,
      cents: area === null ? null : toCents(value * factor * area),
      perAreaWithoutArea: area === null,
    };
  });
  const primary = results[0];
  if (!primary) return null;
  if (primary.cents === null && !primary.recorded) {
    const other = results.find((r) => r.recorded);
    const also = other ? ` A value in another rent column (${other.field}) was not used.` : '';
    issue('missing_value', 'warning', `Rent for suite ${key} is not recorded.${also}`, primary.field);
    return null;
  }
  if (primary.perAreaWithoutArea) {
    issue(
      'missing_value',
      'warning',
      `Rent for suite ${key} is per SF and its area is unrecorded, so annual rent is unrecorded.`,
      primary.field,
    );
  }
  if (primary.cents !== null) {
    for (const other of results.slice(1)) {
      if (other.cents !== null && Math.abs(other.cents - primary.cents) > RENT_TOLERANCE_CENTS) {
        issue(
          'rent_mismatch',
          'warning',
          `Suite ${key}: ${primary.field} and ${other.field} disagree ($${primary.cents / 100} and $${other.cents / 100} a year). ${primary.field} was used.`,
          primary.field,
        );
      }
    }
  }
  return primary.cents;
}

/** A step needs both its date and its annual rent. A half-recorded one is reported, not dropped. */
function readStep(date: string | null, context: RowContext): RentStep[] {
  const { get, key, issue, read } = context;
  const rent = nonNegative(
    read('stepRent', parseNumber(get('stepRent')), 'Rent step', false),
    'stepRent',
    'Rent step',
    context,
  );
  if (date && rent !== null) return [{ date, annualRentCents: toCents(rent) }];
  const shown = (f: LeaseField) => cellText(get(f)) !== '';
  if (shown('stepDate') !== shown('stepRent')) {
    issue(
      'incomplete_rent_step',
      'warning',
      `Suite ${key} has only part of a rent step, so the step was not recorded.`,
      shown('stepDate') ? 'stepRent' : 'stepDate',
    );
  }
  return [];
}

function readTotal(get: (f: LeaseField) => Cell, has: (f: LeaseField) => boolean) {
  const area = parseNumber(get('area'));
  const field = has('annualRent') ? 'annualRent' : has('monthlyRent') ? 'monthlyRent' : null;
  const rent = field ? parseNumber(get(field)) : null;
  return {
    area: area.kind === 'value' ? area.value : null,
    rentCents: rent?.kind === 'value' ? toCents(rent.value * (field === 'monthlyRent' ? 12 : 1)) : null,
  };
}

/** A file's own total that disagrees with its rows suggests a row was lost or misread, here or in the source. */
function checkTotals(
  totals: { row: number; label: string; area: number | null; rentCents: number | null }[],
  leases: ParsedLease[],
  issues: IntakeIssue[],
) {
  const total = totals.at(-1);
  if (!total) return;
  const area = leases.reduce((n, l) => n + (l.areaSf ?? 0), 0);
  if (total.area !== null && Math.abs(total.area - area) > AREA_TOLERANCE) {
    issues.push({
      code: 'total_mismatch',
      severity: 'warning',
      row: total.row,
      message: `The file's total area is ${total.area} SF, but its rows add up to ${area} SF.`,
    });
  }
  const rent = leases.reduce((n, l) => n + (l.annualRentCents ?? 0), 0);
  if (total.rentCents !== null && Math.abs(total.rentCents - rent) > RENT_TOLERANCE_CENTS) {
    issues.push({
      code: 'total_mismatch',
      severity: 'warning',
      row: total.row,
      message: `The file's total rent is $${total.rentCents / 100}, but its rows add up to $${rent / 100}.`,
    });
  }
}

export interface ChosenSheet {
  sheet: { name: string; rows: Cell[][] } | null;
  others: string[];
  /** Another sheet looks just as much like a rent roll, such as a second building. */
  tied: boolean;
}

/** The sheet whose header is the best match, with the names of others that hold data. */
export function chooseSheet(sheets: { name: string; rows: Cell[][] }[]): ChosenSheet {
  const ranked = sheets
    .map((sheet) => ({ sheet, matched: locateHeader(sheet.rows)?.matched ?? 0 }))
    .sort((a, b) => b.matched - a.matched);
  const top = ranked[0];
  if (!top || top.matched === 0) return { sheet: null, others: [], tied: false };
  return {
    sheet: top.sheet,
    others: ranked
      .slice(1)
      .filter((r) => r.sheet.rows.some((row) => row.some((c) => cellText(c))))
      .map((r) => r.sheet.name),
    tied: ranked[1]?.matched === top.matched,
  };
}
