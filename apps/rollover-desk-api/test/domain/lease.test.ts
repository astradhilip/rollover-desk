import { describe, expect, it } from 'vitest';
import {
  expiresBeforeLoanMaturity,
  markToMarketPct,
  noticeDate,
  remainingYears,
} from '../../src/domain/entities/Lease';
import { lease, property } from './fixtures';

describe('remainingYears', () => {
  it('uses days over 365.25', () => {
    expect(remainingYears(lease(), '2026-01-01')).toBeCloseTo(1096 / 365.25, 10);
  });
  it('counts expired and month-to-month as 0', () => {
    expect(remainingYears(lease({ expirationDate: '2025-01-01' }), '2026-01-01')).toBe(0);
    expect(remainingYears(lease({ isMonthToMonth: true, expirationDate: null }), '2026-01-01')).toBe(0);
  });
  it('is null when expiration is unknown', () => {
    expect(remainingYears(lease({ expirationDate: null }), '2026-01-01')).toBeNull();
  });
});

describe('noticeDate', () => {
  it('counts back calendar months and clamps to month-end', () => {
    expect(noticeDate(lease({ expirationDate: '2027-03-31', noticeMonths: 1 }))).toBe('2027-02-28');
    expect(noticeDate(lease({ expirationDate: '2027-06-30', noticeMonths: 9 }))).toBe('2026-09-30');
  });
  it('is absent rather than assumed', () => {
    expect(noticeDate(lease({ noticeMonths: null }))).toBeNull();
    expect(noticeDate(lease({ expirationDate: null }))).toBeNull();
    expect(noticeDate(lease({ isMonthToMonth: true }))).toBeNull();
    expect(noticeDate(lease({ status: 'vacant' }))).toBeNull();
  });
  it('treats an impossible notice term as absent', () => {
    expect(noticeDate(lease({ noticeMonths: -3 }))).toBeNull();
    expect(noticeDate(lease({ noticeMonths: 1.5 }))).toBeNull();
  });
});

describe('expiresBeforeLoanMaturity', () => {
  it('flags only a lease ending before maturity', () => {
    expect(expiresBeforeLoanMaturity(lease({ expirationDate: '2027-12-31' }), property())).toBe(true);
    expect(expiresBeforeLoanMaturity(lease({ expirationDate: '2028-01-01' }), property())).toBe(false);
    expect(expiresBeforeLoanMaturity(lease({ expirationDate: '2028-01-02' }), property())).toBe(false);
  });
  it('treats month-to-month as expiring first', () => {
    expect(expiresBeforeLoanMaturity(lease({ isMonthToMonth: true }), property())).toBe(true);
  });
  it('is null when an input is missing', () => {
    expect(expiresBeforeLoanMaturity(lease(), property({ loanMaturityDate: null }))).toBeNull();
    expect(expiresBeforeLoanMaturity(lease({ expirationDate: null }), property())).toBeNull();
  });
});

describe('markToMarketPct', () => {
  it('is positive when in-place rent is below market', () => {
    // $30/SF in place, $35/SF market: 5 / 30.
    expect(markToMarketPct(lease(), 3_500)).toBeCloseTo(1 / 6, 10);
  });
  it('is negative when in-place rent is above market', () => {
    // $30/SF in place, $24/SF market: -6 / 30.
    expect(markToMarketPct(lease(), 2_400)).toBeCloseTo(-0.2, 10);
  });
  it('is null when an input is missing, never imputed', () => {
    expect(markToMarketPct(lease(), null)).toBeNull();
    expect(markToMarketPct(lease({ areaSf: null }), 3_500)).toBeNull();
    expect(markToMarketPct(lease({ annualRentCents: null }), 3_500)).toBeNull();
    expect(markToMarketPct(lease({ areaSf: 0 }), 3_500)).toBeNull();
    expect(markToMarketPct(lease({ annualRentCents: 0 }), 3_500)).toBeNull();
    expect(markToMarketPct(lease(), 0)).toBeNull();
    expect(markToMarketPct(lease({ status: 'vacant' }), 3_500)).toBeNull();
  });
});
