import { describe, expect, it } from 'vitest';
import { criticalDates, describeCriticalDate } from '../../src/domain/entities/criticalDates';
import { lease, property } from './fixtures';

describe('criticalDates', () => {
  it('sorts dates into passed and upcoming, nearest first, with the next date', () => {
    const r = criticalDates(
      lease({
        expirationDate: '2027-06-30',
        noticeMonths: 9,
        rentSteps: [{ date: '2026-03-01', annualRentCents: 1 }],
      }),
      property({ loanMaturityDate: '2025-12-31' }),
      '2026-01-01',
    );
    expect(r.passed.map((d) => d.kind)).toEqual(['loan_maturity']);
    expect(r.upcoming.map((d) => d.kind)).toEqual(['rent_step', 'notice', 'expiration']);
    expect(r.next?.date).toBe('2026-03-01');
    expect(r.next?.daysAway).toBe(59);
    expect(r.absent).toEqual([]);
  });
  it('counts a date falling today as upcoming', () => {
    const r = criticalDates(
      lease({ expirationDate: '2026-01-01', noticeMonths: null }),
      property(),
      '2026-01-01',
    );
    expect(r.next?.kind).toBe('expiration');
    expect(r.next?.daysAway).toBe(0);
  });
  it('reports what is missing', () => {
    const r = criticalDates(
      lease({ expirationDate: null }),
      property({ loanMaturityDate: null }),
      '2026-01-01',
    );
    expect(r.absent).toEqual(['notice', 'expiration', 'loan_maturity']);
    expect(r.next).toBeNull();
  });
  it('does not call a month-to-month term absent, and ignores a stale expiration on it', () => {
    const none = criticalDates(
      lease({ isMonthToMonth: true, expirationDate: null, noticeMonths: null }),
      property(),
      '2026-01-01',
    );
    expect(none.absent).toEqual([]);
    const stale = criticalDates(
      lease({ isMonthToMonth: true, expirationDate: '2029-01-01' }),
      property(),
      '2026-01-01',
    );
    expect(stale.upcoming.map((d) => d.kind)).toEqual(['loan_maturity']);
  });
  it('gives a vacant suite no lease dates and reports no false gaps', () => {
    const r = criticalDates(
      lease({
        status: 'vacant',
        expirationDate: '2029-01-01',
        rentSteps: [{ date: '2027-01-01', annualRentCents: 1 }],
      }),
      property(),
      '2026-01-01',
    );
    expect(r.upcoming.map((d) => d.kind)).toEqual(['loan_maturity']);
    expect(r.absent).toEqual([]);
  });
});

describe('describeCriticalDate', () => {
  const d = { kind: 'notice' as const, label: 'Renewal notice due', date: 'x' };
  it('reads naturally', () => {
    expect(describeCriticalDate({ ...d, daysAway: 0 })).toBe('Renewal notice due is today');
    expect(describeCriticalDate({ ...d, daysAway: 1 })).toBe('Renewal notice due in 1 day');
    expect(describeCriticalDate({ ...d, daysAway: -30 })).toBe('Renewal notice due passed 30 days ago');
  });
});
