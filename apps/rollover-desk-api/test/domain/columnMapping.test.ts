import { describe, expect, it } from 'vitest';
import { locateHeader, mapColumns, matchHeader } from '../../src/domain/entities/columnMapping';

const fieldOf = (h: string) => matchHeader(h)?.field ?? null;

describe('matchHeader', () => {
  it('maps common spellings with full confidence', () => {
    expect(matchHeader('Suite #')).toEqual({ field: 'suite', confidence: 1 });
    expect(fieldOf('Sq Ft')).toBe('area');
    expect(fieldOf('Monthly Base Rent')).toBe('monthlyRent');
    expect(fieldOf('Ann. Base Rent')).toBe('annualRent');
    expect(fieldOf('Lease Exp')).toBe('expiration');
    expect(fieldOf('Notice (Months)')).toBe('noticeMonths');
  });
  it('lowers confidence when only some of the words matched', () => {
    expect(matchHeader('Lease Term Expiration')).toEqual({ field: 'expiration', confidence: 0.8 });
  });
  it('keeps per-SF rent apart from dollar rent', () => {
    expect(fieldOf('Base Rent Annual $/SF')).toBe('annualRentPsf');
    expect(fieldOf('Base Rent Annual')).toBe('annualRent');
  });
  it('does not guess a rent period', () => {
    expect(fieldOf('Rent')).toBe('rentUnknownBasis');
    expect(fieldOf('$/SF')).toBe('rentUnknownBasis');
  });
  it('leaves unknown columns unmapped', () => {
    expect(matchHeader('Parking Spaces Reserved')?.field).not.toBe('tenant');
    expect(matchHeader('Comments')).toBeNull();
    expect(matchHeader('')).toBeNull();
  });
});

describe('mapColumns', () => {
  const base = ['Suite', 'Tenant', 'SF', 'Annual Rent', 'Expiration', 'Notice'];
  it('has no problems on a complete header', () => {
    expect(mapColumns(base).problems).toEqual([]);
  });
  it('blocks when a required column is missing', () => {
    const { problems } = mapColumns(['Suite', 'Tenant', 'SF']);
    expect(problems.filter((p) => p.code === 'missing_column').map((p) => p.message)).toEqual([
      'No expiration column found.',
      'No rent column found.',
    ]);
  });
  it('warns when there is no notice column', () => {
    const { problems } = mapColumns(base.slice(0, 5));
    expect(problems).toEqual([expect.objectContaining({ code: 'no_notice_column', severity: 'warning' })]);
  });
  it('blocks a rent with no period until the analyst chooses', () => {
    const headers = ['Suite', 'Tenant', 'SF', 'Rent', 'Expiration', 'Notice'];
    expect(mapColumns(headers).problems[0]).toMatchObject({
      code: 'ambiguous_rent_basis',
      severity: 'blocking',
    });
    expect(mapColumns(headers, { 3: 'monthlyRent' }).problems).toEqual([]);
  });
  it('blocks two equally likely columns and uses neither', () => {
    const { columns, problems } = mapColumns([
      'Suite',
      'Tenant',
      'Lessee',
      'SF',
      'Annual Rent',
      'Expiration',
      'Notice',
    ]);
    expect(problems.map((p) => p.code)).toContain('column_conflict');
    expect(columns.filter((c) => c.field === 'tenant')).toEqual([]);
  });
  it('uses the stronger match when two columns compete', () => {
    const { columns } = mapColumns([...base, 'Lease Term Expiration']);
    expect(columns.find((c) => c.field === 'expiration')!.header).toBe('Expiration');
    expect(columns[6]!.field).toBeNull();
  });
  it('lets the analyst ignore a column', () => {
    const { columns } = mapColumns(base, { 5: null });
    expect(columns[5]).toMatchObject({ field: null, overridden: true });
  });
});

describe('locateHeader', () => {
  it('skips title rows', () => {
    const r = locateHeader([['Report'], [], ['Suite', 'Tenant', 'SF', 'Annual Rent'], ['100']]);
    expect(r).toMatchObject({ headerRow: 2, dataStart: 3 });
  });
  it('combines a header split over two rows', () => {
    const r = locateHeader([
      ['Suite', 'Tenant', 'SF', 'Base Rent', 'Lease Term', null],
      [null, null, null, 'Annual $/SF', 'Commencement', 'Expiration'],
    ]);
    expect(r?.dataStart).toBe(2);
    expect(r?.headers[3]).toBe('Base Rent Annual $/SF');
    expect(r?.headers[5]).toBe('Expiration');
  });
  it('is null when nothing looks like a header', () => {
    expect(
      locateHeader([
        ['a', 'b'],
        [1, 2],
      ]),
    ).toBeNull();
    expect(locateHeader([])).toBeNull();
  });
});
