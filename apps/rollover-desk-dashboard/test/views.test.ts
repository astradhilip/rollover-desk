import type { CriticalDatesView, LeaseView, RolloverView } from '@rollover-desk/contracts';
import { describe, expect, it } from 'vitest';
import { calendar, filterLeases, markState, percentToBps, rolloverBars, sortLeases } from '../lib/views';

const bucket = (rentShare: number | null, areaShare: number | null) => ({
  leases: 1,
  areaSf: 10,
  annualRentCents: 100,
  leasesMissingRent: 0,
  leasesMissingArea: 0,
  rentShare,
  areaShare,
  cumulativeRentShare: rentShare,
  cumulativeAreaShare: areaShare,
});

describe('rolloverBars', () => {
  const schedule = {
    mtmOrExpired: bucket(0.1, 0.2),
    years: [{ ...bucket(0.3, 0.4), year: 2027 }],
    beyondHorizon: bucket(null, null),
  } as unknown as RolloverView['schedule'];
  it('switches basis and keeps a missing share missing', () => {
    expect(rolloverBars(schedule, 'rent').map((b) => b.share)).toEqual([0.1, 0.3, null]);
    expect(rolloverBars(schedule, 'area').map((b) => b.share)).toEqual([0.2, 0.4, null]);
    expect(rolloverBars(schedule, 'rent')[1]).toMatchObject({ label: '2027', short: '’27' });
  });
});

describe('markState', () => {
  it('marks at the boundaries', () => {
    expect([-1, 0, 90, 91].map(markState)).toEqual(['passed', 'soon', 'soon', 'upcoming']);
  });
});

describe('calendar', () => {
  const d = (date: string, daysAway: number, kind = 'notice') =>
    ({ kind, label: kind, date, daysAway }) as never;
  const view = {
    asOf: '2026-11-02',
    leases: [
      {
        leaseId: 'a',
        suite: '100',
        tenantName: 'Acme',
        passed: [d('2026-01-01', -305)],
        upcoming: [d('2027-10-31', 363), d('2027-11-01', 364), d('2026-11-30', 28, 'expiration')],
        absent: ['loan_maturity'],
        next: null,
      },
    ],
  } as unknown as CriticalDatesView;
  it('runs twelve months across the year end and loses nothing', () => {
    const c = calendar(view, null);
    expect(c.months[0]!.key).toBe('2026-11');
    expect(c.months[11]!.key).toBe('2027-10');
    expect(c.months[0]!.items).toHaveLength(1);
    expect(c.months[11]!.items).toHaveLength(1);
    expect(c.later.map((i) => i.date)).toEqual(['2027-11-01']);
    expect(c.passed).toHaveLength(1);
    expect(c.absent).toEqual([]);
    expect(c.loanMissing).toBe(true);
  });
  it('lists loan maturity once, for the property', () => {
    const lease = (leaseId: string) => ({
      ...view.leases[0]!,
      leaseId,
      passed: [],
      absent: [],
      upcoming: [d('2028-06-30', 600, 'loan_maturity')],
    });
    const c = calendar({ asOf: '2026-11-02', leases: [lease('a'), lease('b')] }, null);
    expect(c.later).toHaveLength(1);
    expect(c.later[0]!.leaseId).toBe('');
  });
  it('filters by kind', () => {
    expect(calendar(view, 'expiration').months.flatMap((m) => m.items)).toHaveLength(1);
  });
});

describe('leases', () => {
  const l = (id: string, expirationDate: string | null, rent: number | null, score: number | null) =>
    ({
      status: 'occupied',
      isMonthToMonth: false,
      id,
      suite: id,
      tenantName: `T${id}`,
      expirationDate,
      annualRentCents: rent,
      risk:
        score === null
          ? { scored: false, reasons: [] }
          : { scored: true, score, components: [], leftOut: [] },
    }) as unknown as LeaseView;
  const rows = [l('a', null, 5, 1), l('b', '2030-01-01', null, null), l('c', '2028-01-01', 9, 7)];
  it('sorts with missing values last on every column', () => {
    expect(sortLeases(rows, 'expiration').map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(sortLeases(rows, 'rent').map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(sortLeases(rows, 'risk').map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('ranks month-to-month first and vacant last when sorting by expiration', () => {
    const mtm = { ...l('m', null, 1, 1), isMonthToMonth: true };
    const vacant = { ...l('v', null, null, null), status: 'vacant' } as LeaseView;
    const sorted = sortLeases([vacant, l('u', null, 1, 1), l('d', '2030-01-01', 1, 1), mtm], 'expiration');
    expect(sorted.map((x) => x.id)).toEqual(['m', 'd', 'u', 'v']);
  });
  it('filters by suite or tenant', () => {
    expect(filterLeases(rows, ' tc ').map((x) => x.id)).toEqual(['c']);
    expect(filterLeases(rows, '')).toHaveLength(3);
  });
});

describe('percentToBps', () => {
  it('converts, and refuses a blank or invalid rate', () => {
    expect(percentToBps('4')).toBe(400);
    expect(percentToBps('2.25')).toBe(225);
    expect(percentToBps('0')).toBe(0);
    for (const bad of ['', ' ', 'abc', '-1', '100.01', '1.234']) expect(percentToBps(bad)).toBeNull();
  });
});
