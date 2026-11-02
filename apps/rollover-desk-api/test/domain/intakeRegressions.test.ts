import { describe, expect, it } from 'vitest';
import { locateHeader, matchHeader } from '../../src/domain/entities/columnMapping';
import { chooseSheet, parseRentRoll } from '../../src/domain/entities/rentRollIntake';
import {
  parseDate,
  parseNoticeMonths,
  parseNumber,
  type Cell,
  toCents,
} from '../../src/domain/entities/spreadsheetCells';

const AS_OF = '2026-01-15';
const HEAD = ['Suite', 'Tenant', 'SF', 'Annual Rent', 'Start', 'Expiration', 'Notice'];
const good: Cell[] = ['100', 'Acme', 10000, 300000, '1/1/2020', '12/31/2029', 12];
const parse = (...rows: Cell[][]) => parseRentRoll([HEAD, ...rows], AS_OF);
const withHead = (head: string[], ...rows: Cell[][]) => parseRentRoll([head, ...rows], AS_OF);
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

describe('rows are never silently lost', () => {
  it('keeps tenants with "total" in their name', () => {
    const r = withHead(
      ['Tenant', 'Suite', 'SF', 'Annual Rent', 'Expiration', 'Notice'],
      ['Total Wine & More', '200', 5000, 100000, '1/1/2030', 12],
      ['Sports Total', '201', 5000, 100000, '1/1/2030', 12],
    );
    expect(r.leases.map((l) => l.tenantName)).toEqual(['Total Wine & More', 'Sports Total']);
    expect(r.skippedRows).toEqual([]);
  });
  it('blocks such a tenant with no suite rather than skipping it', () => {
    const r = parse([null, 'Total Wine & More', 5000, 100000, '1/1/2020', '1/1/2030', 12]);
    expect(codes(r)).toEqual(['missing_suite']);
    expect(r.canConfirm).toBe(false);
  });
  it('keeps a suite whose tenant is called Total', () => {
    expect(parse(['200', 'Total', 1000, 30000, '1/1/2020', '1/1/2030', 12]).leases).toHaveLength(1);
  });
  it('recognises summary rows and does not double-count them', () => {
    for (const label of [
      'Building Total:',
      'Occupied Total:',
      'Average',
      'Sum',
      'Occupancy',
      'Total:',
      'Floor 2 Subtotal',
    ]) {
      const r = parse(good, [label, null, 10000, 300000]);
      expect(r.leases, label).toHaveLength(1);
      expect(r.skippedRows[0]!.reason, label).toBe('subtotal');
    }
  });
  it('finds a summary label behind a leading column', () => {
    const r = withHead(
      ['Bldg', 'Suite', 'Tenant', 'SF', 'Annual Rent', 'Expiration'],
      ['A', 'Total', null, 10000, 300000, null],
    );
    expect(r.leases).toEqual([]);
  });
  it('flags a lone suite, tenant or value, and only treats wording as a note', () => {
    for (const row of [[null, 'Acme Corp'], ['300'], [null, null, null, 250000]] as Cell[][]) {
      expect(codes(parse(row))).toEqual(['unattached_row']);
    }
    expect(parse(['West Wing']).skippedRows[0]!.reason).toBe('note');
  });
  it('does not turn a merged banner into a lease', () => {
    const r = parse(['West Wing', 'West Wing', 'West Wing', 'West Wing', 'West Wing']);
    expect(r.leases).toEqual([]);
    expect(r.skippedRows[0]!.reason).toBe('note');
    expect(r.canConfirm).toBe(true);
  });
});

describe('header detection', () => {
  it('does not swallow the first data row', () => {
    const r = withHead(
      ['Suite', 'Tenant', 'SF', 'Annual Rent', 'Expiration', 'Comments'],
      ['100', 'Acme', 10000, 300000, '1/1/2030', 'Renewal notice sent'],
      ['101', 'Beta', 5000, 150000, '1/1/2030', null],
    );
    expect(r.leases.map((l) => l.suite)).toEqual(['100', '101']);
  });
  it('prefers the exact header to one with a title stuck on', () => {
    expect(locateHeader([['Rent Roll'], HEAD, good])?.headers[0]).toBe('Suite');
  });
});

describe('column meaning', () => {
  it('reads per-SF spellings as rent, never as area', () => {
    expect(matchHeader('Annual Rent Per Sq Ft')?.field).toBe('annualRentPsf');
    expect(matchHeader('Monthly Rent per Sq. Ft.')?.field).toBe('monthlyRentPsf');
    expect(matchHeader('Rent/Sq Ft')?.field).toBe('rentUnknownBasis');
  });
  it('does not read other money or a days column as rent or notice', () => {
    for (const h of [
      'Market Rent Annual',
      'Annual Rent Increase',
      'Annual CAM Rent',
      'Prior Monthly Rent',
      'Notice (Days)',
    ]) {
      expect(matchHeader(h), h).toBeNull();
    }
  });
  it('does not assume the period of a step rent', () => {
    expect(matchHeader('Next Step Rent')?.field).toBe('rentUnknownBasis');
    expect(matchHeader('Next Step Annual Rent')?.field).toBe('stepRent');
  });
});

describe('rent', () => {
  it('reports half a rent step', () => {
    const head = [
      'Suite',
      'Tenant',
      'SF',
      'Annual Rent',
      'Expiration',
      'Notice',
      'Step Date',
      'Next Step Annual Rent',
    ];
    const r = withHead(
      head,
      ['1', 'A', 1000, 30000, '1/1/2030', 12, '1/1/2027', null],
      ['2', 'B', 1000, 30000, '1/1/2030', 12, null, 31000],
    );
    expect(codes(r)).toEqual(['incomplete_rent_step', 'incomplete_rent_step']);
  });
  it('compares every rent column, including per SF', () => {
    const head = ['Suite', 'Tenant', 'SF', 'Annual Rent', 'Annual $/SF', 'Expiration', 'Notice'];
    expect(codes(withHead(head, ['1', 'A', 1000, 300000, 99, '1/1/2030', 12]))).toContain('rent_mismatch');
  });
  it('does not fill blank annual rent from monthly, but says one exists', () => {
    const head = ['Suite', 'Tenant', 'SF', 'Annual Rent', 'Monthly Rent', 'Expiration', 'Notice'];
    const r = withHead(head, ['1', 'A', 1000, null, 2500, '1/1/2030', 12]);
    expect(r.leases[0]!.annualRentCents).toBeNull();
    expect(r.issues[0]!.message).toMatch(/monthlyRent/);
    expect(codes(withHead(head, ['1', 'A', 1000, null, 'bad', '1/1/2030', 12]))).toContain('invalid_number');
  });
  it('blocks a per-SF value in a flat rent column', () => {
    expect(codes(parse(['1', 'A', 1000, '$31.50/SF', '1/1/2020', '1/1/2030', 12]))).toEqual([
      'invalid_number',
    ]);
  });
  it('treats zero area as unrecorded, and never derives $0 rent from it', () => {
    const r = withHead(
      ['Suite', 'Tenant', 'SF', 'Annual $/SF', 'Expiration', 'Notice'],
      ['1', 'A', 0, 31.5, '1/1/2030', 12],
    );
    expect(r.leases[0]).toMatchObject({ areaSf: null, annualRentCents: null });
    expect(r.issues.length).toBeGreaterThan(0);
  });
  it('checks totals with a colon and for monthly rent', () => {
    expect(codes(parse(good, ['Total:', null, 99999, 1]))).toContain('total_mismatch');
    const r = withHead(
      ['Suite', 'Tenant', 'SF', 'Monthly Rent', 'Expiration', 'Notice'],
      ['1', 'A', 1000, 2500, '1/1/2030', 12],
      ['Total', null, 1000, 99999, null, null],
    );
    expect(codes(r)).toEqual(['total_mismatch']);
  });
  it('rounds half a cent up despite binary fractions', () => {
    expect(toCents(0.145)).toBe(15);
    expect(toCents(1.005 * 1001)).toBe(100601);
  });
});

describe('vacancy and placeholders', () => {
  it('reads vacancy wording as vacant, not as a tenant', () => {
    for (const t of [
      'Vacant Suite',
      'Vacant - Spec Suite',
      'Vacant Space',
      'Vacancy',
      'VACANT/AVAILABLE',
      'Not Leased',
      'Available 3/1',
    ]) {
      expect(parse(['1', t, 1000]).leases[0]!.status, t).toBe('vacant');
    }
  });
  it('keeps real names that start the same way, with a flag', () => {
    const r = parse(['1', 'Vacant Lot Holdings', 1000, 30000, '1/1/2020', '1/1/2030', 12]);
    expect(r.leases[0]!.tenantName).toBe('Vacant Lot Holdings');
    expect(codes(r)).toEqual(['possible_vacancy']);
  });
  it('treats a placeholder tenant as unrecorded', () => {
    for (const t of ['N/A', '-', 'TBD', 'none']) {
      const r = parse(['1', t, 1000, 30000, '1/1/2020', '1/1/2030', 12]);
      expect(r.leases[0]!.tenantName, t).toBeNull();
    }
  });
  it('reports lease data on a vacant row, only when it is really there', () => {
    expect(codes(parse(['1', 'Vacant', 5000, null, '1/1/2020', '12/31/2030', 12]))).toEqual([
      'vacant_with_lease_data',
    ]);
    expect(codes(parse(['1', 'Vacant', 5000, '-']))).toEqual([]);
    expect(codes(parse(['1', 'Vacant', 5000, 0]))).toEqual([]);
    const head = ['Suite', 'Tenant', 'SF', 'Annual Rent', 'Monthly Rent', 'Expiration'];
    expect(codes(withHead(head, ['1', 'Vacant', 100, null, 500, null]))).toContain('vacant_with_rent');
  });
  it('warns about a vacant suite with no area', () => {
    expect(codes(parse(['1', 'Vacant', null]))).toEqual(['missing_value']);
  });
});

describe('formula failures', () => {
  it('blocks a failed formula in a text column', () => {
    for (const bad of ['#NO_STORED_VALUE', '#REF!']) {
      const r = parse(['1', bad, 1000, 30000, '1/1/2020', '1/1/2030', 12]);
      expect(codes(r)).toEqual(['formula_error']);
      expect(r.leases[0]!.tenantName).toBeNull();
      expect(codes(parse([bad, 'A', 1000, 30000, '1/1/2020', '1/1/2030', 12]))).toEqual(['formula_error']);
    }
  });
});

describe('dates', () => {
  it('refuses trailing text, loose month names and impossible date cells without throwing', () => {
    expect(parseDate('2029-01-31 extended to 2031').kind).toBe('invalid');
    expect(parseDate('2029-01-31Tgarbage').kind).toBe('invalid');
    expect(parseDate('2029-01-31 00:00:00').kind).toBe('value');
    expect(parseDate('Mayhem 1, 2030').kind).toBe('invalid');
    expect(parseDate({ date: '2027-02-30' }).kind).toBe('invalid');
    expect(parseDate({ date: '+010113-09' }).kind).toBe('invalid');
    expect(() =>
      parse(['1', 'A', 1000, 30000, { date: '+010113-09' }, { date: '2027-02-30' }, 12]),
    ).not.toThrow();
  });
  it('blocks a file mixing day-first dates with dates readable either way', () => {
    const r = parse(['1', 'A', 1000, 30000, '13/02/2020', '03/04/2029', 12]);
    expect(codes(r)).toEqual(['unusual_date_format', 'mixed_date_order']);
    expect(r.canConfirm).toBe(false);
  });
  it('flags a commencement far from the as-of date', () => {
    expect(codes(parse(['1', 'A', 1000, 30000, '6/1/98', 'MTM', null]))).toEqual(['date_out_of_range']);
    expect(parse(['1', 'A', 1000, 30000, '1/1/0200', '1/1/2030', 12]).canConfirm).toBe(false);
  });
});

describe('numbers', () => {
  it('refuses unbalanced or contradictory negatives and absurd sizes', () => {
    for (const c of ['(30,000', '1,000)', '(-30000)', '9'.repeat(401)])
      expect(parseNumber(c).kind, c).toBe('invalid');
    expect(parseNumber(Number.NaN).kind).toBe('invalid');
    expect(parseNumber('-5')).toEqual({ kind: 'value', value: -5 });
  });
  it('caps notice terms', () => {
    expect(parseNoticeMonths('99999999999').kind).toBe('invalid');
    expect(parseNoticeMonths(121).kind).toBe('invalid');
  });
});

describe('chooseSheet', () => {
  it('reports two equally likely sheets', () => {
    const a = { name: 'East', rows: [HEAD] };
    const b = { name: 'West', rows: [HEAD] };
    expect(chooseSheet([a, b]).tied).toBe(true);
  });
});
