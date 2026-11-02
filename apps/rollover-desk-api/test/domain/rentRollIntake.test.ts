import { describe, expect, it } from 'vitest';
import { chooseSheet, parseRentRoll } from '../../src/domain/entities/rentRollIntake';
import type { Cell } from '../../src/domain/entities/spreadsheetCells';

const AS_OF = '2026-01-15';
const HEAD = ['Suite', 'Tenant', 'SF', 'Annual Rent', 'Start', 'Expiration', 'Notice'];
const row = (...cells: Cell[]) => cells;
const parse = (...rows: Cell[][]) => parseRentRoll([HEAD, ...rows], AS_OF);
const good = row('100', 'Acme', '10,000', '$300,000.00', '1/1/2020', '12/31/2029', 12);
const codes = (r: ReturnType<typeof parse>) => r.issues.map((i) => i.code);

describe('parseRentRoll', () => {
  it('reads a good row exactly', () => {
    const r = parse(good);
    expect(r.canConfirm).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.leases[0]).toEqual({
      id: 'row-2',
      sourceRow: 2,
      suite: '100',
      tenantName: 'Acme',
      status: 'occupied',
      areaSf: 10_000,
      annualRentCents: 30_000_000,
      commencementDate: '2020-01-01',
      expirationDate: '2029-12-31',
      isMonthToMonth: false,
      noticeMonths: 12,
      rentSteps: [],
    });
  });

  it('converts monthly and per-SF rent to annual cents', () => {
    const monthly = parseRentRoll(
      [
        ['Suite', 'Tenant', 'SF', 'Monthly Rent', 'Expiration'],
        ['1', 'A', 1000, '2,500.25', '1/1/2030'],
      ],
      AS_OF,
    );
    expect(monthly.leases[0]!.annualRentCents).toBe(3_000_300);
    const psf = parseRentRoll(
      [
        ['Suite', 'Tenant', 'SF', 'Annual $/SF', 'Expiration'],
        ['1', 'A', 1000, 31.5, '1/1/2030'],
      ],
      AS_OF,
    );
    expect(psf.leases[0]!.annualRentCents).toBe(3_150_000);
    const mpsf = parseRentRoll(
      [
        ['Suite', 'Tenant', 'SF', 'Monthly $/SF', 'Expiration'],
        ['1', 'A', 1000, 2.5, '1/1/2030'],
      ],
      AS_OF,
    );
    expect(mpsf.leases[0]!.annualRentCents).toBe(3_000_000);
  });

  it('cannot derive per-SF rent without area, and does not guess', () => {
    const r = parseRentRoll(
      [
        ['Suite', 'Tenant', 'SF', 'Annual $/SF', 'Expiration'],
        ['1', 'A', null, 31.5, '1/1/2030'],
      ],
      AS_OF,
    );
    expect(r.leases[0]!.annualRentCents).toBeNull();
    expect(r.canConfirm).toBe(true);
  });

  it('leaves blanks unrecorded, warns, and never imputes', () => {
    const r = parse(row('100', 'Acme', null, null, null, null, null));
    expect(r.leases[0]).toMatchObject({
      areaSf: null,
      annualRentCents: null,
      expirationDate: null,
      noticeMonths: null,
    });
    expect(codes(r)).toEqual(['missing_value', 'missing_value', 'missing_value']);
    expect(r.canConfirm).toBe(true);
  });

  it('blocks unreadable values rather than dropping them', () => {
    const r = parse(row('100', 'Acme', 'lots', '$x', '1/1/2020', '02/30/2029', 12));
    expect(codes(r)).toEqual(['invalid_number', 'invalid_number', 'invalid_date']);
    expect(r.canConfirm).toBe(false);
    expect(r.issues[0]).toMatchObject({ row: 2, suite: '100', column: 'SF' });
    expect(r.leases).toHaveLength(1);
  });

  it('blocks negative area and rent', () => {
    const r = parse(row('100', 'Acme', -5, '(1,000)', '1/1/2020', '1/1/2030', 12));
    expect(codes(r)).toEqual(['invalid_number', 'invalid_number']);
    expect(r.leases[0]).toMatchObject({ areaSf: null, annualRentCents: null });
  });

  it('recognises vacant suites and clears lease fields', () => {
    const r = parse(row('100', 'VACANT', 5000, null, null, null, null), row('101', '-- Available --', 100));
    expect(r.leases[0]).toMatchObject({
      status: 'vacant',
      tenantName: null,
      areaSf: 5000,
      expirationDate: null,
    });
    expect(r.leases[1]!.status).toBe('vacant');
    expect(r.issues).toEqual([]);
  });

  it('warns about a vacant suite showing rent', () => {
    const r = parse(row('100', 'Vacant', 5000, 1000));
    expect(codes(r)).toEqual(['vacant_with_rent']);
    expect(r.leases[0]!.annualRentCents).toBeNull();
  });

  it('recognises month-to-month without inventing an expiration', () => {
    for (const text of ['MTM', 'Month to Month', 'month-to-month', 'Holdover']) {
      const r = parse(row('100', 'Acme', 1000, 1000, null, text, null));
      expect(r.leases[0]).toMatchObject({ isMonthToMonth: true, expirationDate: null, noticeMonths: null });
      expect(r.issues).toEqual([]);
    }
  });

  it('accounts for every row: subtotals, notes and unattached rows are recorded', () => {
    const r = parse(
      row('West Wing'),
      good,
      row(null, null, null, 31, 'Option term'),
      row('Floor 1 Subtotal', null, 10000),
      row(),
      row('Unaudited.'),
    );
    expect(r.leases).toHaveLength(1);
    expect(r.skippedRows.map((s) => s.reason)).toEqual(['note', 'unattached', 'subtotal', 'note']);
    expect(codes(r)).toEqual(['unattached_row']);
  });

  it('blocks a duplicate suite and a tenant with no suite', () => {
    expect(codes(parse(good, good))).toEqual(['duplicate_suite']);
    const r = parse(row(null, 'Acme', 1000, 30000, '1/1/2020', '1/1/2030', 12));
    expect(codes(r)).toEqual(['missing_suite']);
    expect(r.canConfirm).toBe(false);
  });

  it('blocks a lease that expires before it commences', () => {
    expect(codes(parse(row('1', 'A', 1000, 30000, '1/1/2031', '12/31/2030', 12)))).toEqual(['date_order']);
  });

  it('warns about an expired lease and a mistyped year', () => {
    expect(codes(parse(row('1', 'A', 1000, 30000, '1/1/2020', '12/31/2025', 12)))).toEqual(['expired_lease']);
    expect(codes(parse(row('1', 'A', 1000, 30000, '1/1/2020', '12/31/2099', 12)))).toEqual([
      'date_out_of_range',
    ]);
  });

  it('warns about rent far outside a plausible range', () => {
    expect(codes(parse(row('1', 'A', 1000, 12, '1/1/2020', '1/1/2030', 12)))).toEqual(['rent_out_of_range']);
    expect(codes(parse(row('1', 'A', 1000, 600_000, '1/1/2020', '1/1/2030', 12)))).toEqual([
      'rent_out_of_range',
    ]);
  });

  it('warns when annual and monthly disagree, and uses annual', () => {
    const r = parseRentRoll(
      [
        ['Suite', 'Tenant', 'SF', 'Annual Rent', 'Monthly Rent', 'Expiration', 'Notice'],
        ['1', 'A', 1000, 36000, 2000, '1/1/2030', 12],
      ],
      AS_OF,
    );
    expect(r.issues.map((i) => i.code)).toEqual(['rent_mismatch']);
    expect(r.leases[0]!.annualRentCents).toBe(3_600_000);
  });

  it('compares the file total with its rows', () => {
    expect(codes(parse(good, row('Grand Total', null, 10000, 300000)))).toEqual([]);
    expect(codes(parse(good, row('Grand Total', null, 11000, 300000)))).toEqual(['total_mismatch']);
    expect(codes(parse(good, row('Total', null, 10000, 299000)))).toEqual(['total_mismatch']);
  });

  it('keeps spreadsheet-formula text as literal data', () => {
    const r = parse(row('100', '=HYPERLINK("x")', 1000, 30000, '1/1/2020', '1/1/2030', 12));
    expect(r.leases[0]!.tenantName).toBe('=HYPERLINK("x")');
  });

  it('refuses an uncomputed formula instead of treating it as blank', () => {
    expect(codes(parse(row('1', 'A', 1000, '#NO_STORED_VALUE', '1/1/2020', '1/1/2030', 12)))).toEqual([
      'invalid_number',
    ]);
    expect(codes(parse(row('1', 'A', 1000, '#REF!', '1/1/2020', '1/1/2030', 12)))).toEqual([
      'invalid_number',
    ]);
  });

  it('blocks when no header exists', () => {
    const r = parseRentRoll([['just'], ['text']], AS_OF);
    expect(r.canConfirm).toBe(false);
    expect(r.issues[0]!.code).toBe('no_header');
  });

  it('applies analyst overrides', () => {
    const rows: Cell[][] = [
      ['Suite', 'Tenant', 'SF', 'Rent', 'Expiration', 'Notice'],
      ['1', 'A', 1000, 2500, '1/1/2030', 12],
    ];
    expect(parseRentRoll(rows, AS_OF).canConfirm).toBe(false);
    const r = parseRentRoll(rows, AS_OF, { 3: 'monthlyRent' });
    expect(r.canConfirm).toBe(true);
    expect(r.leases[0]!.annualRentCents).toBe(3_000_000);
  });
});

describe('chooseSheet', () => {
  const roll = { name: 'Roll', rows: [HEAD, good] };
  it('picks the sheet with the best header and names the others', () => {
    const r = chooseSheet([{ name: 'Cover', rows: [['Hello']] }, roll, { name: 'Empty', rows: [] }]);
    expect(r.sheet?.name).toBe('Roll');
    expect(r.others).toEqual(['Cover']);
  });
  it('is null when no sheet has a header', () => {
    expect(chooseSheet([{ name: 'Cover', rows: [['Hello']] }]).sheet).toBeNull();
  });
});
