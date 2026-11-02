import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RISK_WEIGHTS,
  scoreLeaseRisk,
  scoreRentRoll,
  validateRiskWeights,
} from '../../src/domain/entities/risk';
import { lease, property } from './fixtures';

const AS_OF = '2026-01-01';
/** A tenant holding 20% of rent, and another 80%. */
const big = lease({
  id: 'big',
  tenantName: 'Big',
  annualRentCents: 80_000_000,
  expirationDate: '2040-01-01',
});
const withShare = (over: Parameters<typeof lease>[0], rent = 20_000_000) => {
  const subject = lease({ id: 's', tenantName: 'Subject', annualRentCents: rent, ...over });
  return { subject, all: [subject, big] };
};

const scored = (r: ReturnType<typeof scoreLeaseRisk>) => {
  if (!r.scored) throw new Error(`Expected a score: ${r.reasons.join()}`);
  return r;
};

describe('scoreLeaseRisk', () => {
  it('hand example, near-term lease: 100×.4 + 100×.2 + 80×.25 + 100×.15 = 95', () => {
    const { subject, all } = withShare({ expirationDate: '2027-01-01', noticeMonths: 12 });
    const r = scored(scoreLeaseRisk(subject, all, property(), AS_OF));
    expect(r.score).toBeCloseTo(95, 10);
    expect(r.components.map((c) => c.raw)).toEqual([100, 100, 80, 100]);
  });

  it('hand example, longer lease: 25×.4 + 0×.2 + 40×.25 + 0×.15 = 20', () => {
    // 1461 days is exactly 48 months at 365.25/12, so (60-48)/48 = 25. Notice is 1277 days out.
    const { subject, all } = withShare({ expirationDate: '2030-01-01', noticeMonths: 6 }, 8_888_889);
    const r = scored(scoreLeaseRisk(subject, all, property(), AS_OF));
    expect(r.components[0]!.raw).toBeCloseTo(25, 10);
    expect(r.components[1]!.raw).toBe(0);
    expect(r.components[2]!.raw).toBeCloseTo(40, 3);
    expect(r.components[3]!.raw).toBe(0);
    expect(r.score).toBeCloseTo(20, 3);
  });

  it('rescales weights when the notice term is missing: 25×.5 + 40×.3125 + 0×.1875 = 25', () => {
    const { subject, all } = withShare({ expirationDate: '2030-01-01', noticeMonths: null }, 8_888_889);
    const r = scored(scoreLeaseRisk(subject, all, property(), AS_OF));
    expect(r.leftOut.map((l) => l.key)).toEqual(['notice_urgency']);
    expect(r.components.map((c) => c.appliedWeight)).toEqual([50, 31.25, 18.75]);
    expect(r.score).toBeCloseTo(25, 3);
  });

  it('leaves out loan mismatch when maturity is unrecorded', () => {
    const { subject, all } = withShare({ expirationDate: '2027-01-01' });
    const r = scored(scoreLeaseRisk(subject, all, property({ loanMaturityDate: null }), AS_OF));
    expect(r.leftOut.map((l) => l.key)).toEqual(['loan_mismatch']);
  });

  it('boundaries of the linear scales', () => {
    const raw = (expirationDate: string) => {
      const { subject, all } = withShare({ expirationDate, noticeMonths: null });
      return scored(scoreLeaseRisk(subject, all, property(), AS_OF)).components[0]!.raw;
    };
    expect(raw('2025-01-01')).toBe(100); // expired
    expect(raw('2031-01-01')).toBeCloseTo(0.0171, 3); // 1826 days: just under 60 months
    expect(raw('2031-01-02')).toBe(0); // 1827 days: just over
    expect(raw('2036-01-01')).toBe(0);
    expect(raw('2026-12-31')).toBe(100); // under 12 months
    // 2028-01-01 is 730 days, 23.984 months: (60-23.984)/48 = 75.03.
    expect(raw('2028-01-01')).toBeCloseTo(75.03, 2);
  });

  it('notice urgency is 100 at 90 days and when passed, 0 at 365 days', () => {
    const raw = (noticeMonths: number, expirationDate: string) => {
      const { subject, all } = withShare({ expirationDate, noticeMonths });
      return scored(scoreLeaseRisk(subject, all, property(), AS_OF)).components[1]!.raw;
    };
    expect(raw(12, '2026-06-01')).toBe(100); // passed
    expect(raw(12, '2028-06-01')).toBe(0);
    // Notice dates exactly 90, 91 and 365 days after 2026-01-01; (365-91)/275 = 99.636.
    expect(raw(0, '2026-04-01')).toBe(100);
    expect(raw(0, '2026-04-02')).toBeCloseTo(99.636, 3);
    expect(raw(0, '2027-01-01')).toBe(0);
  });

  it('caps concentration at 100', () => {
    const solo = lease({ tenantName: 'Solo', expirationDate: '2030-01-01' });
    const r = scored(scoreLeaseRisk(solo, [solo], property(), AS_OF));
    expect(r.components.find((c) => c.key === 'concentration')!.raw).toBe(100);
  });

  it('scores month-to-month as maximum time risk', () => {
    const { subject, all } = withShare({ isMonthToMonth: true, expirationDate: null });
    const r = scored(scoreLeaseRisk(subject, all, property(), AS_OF));
    expect(r.components[0]!.raw).toBe(100);
    expect(r.leftOut[0]!.reason).toMatch(/Month-to-month/);
  });

  it('never invents a score when required inputs are missing', () => {
    for (const over of [{ expirationDate: null }, { annualRentCents: null }, { tenantName: null }]) {
      const s = lease(over);
      const r = scoreLeaseRisk(s, [s, big], property(), AS_OF);
      expect(r.scored).toBe(false);
      if (!r.scored) expect(r.reasons.length).toBeGreaterThan(0);
    }
    expect(scoreLeaseRisk(lease({ status: 'vacant' }), [], property(), AS_OF).scored).toBe(false);
  });

  it('shows its working: component points add up to the score', () => {
    const { subject, all } = withShare({ expirationDate: '2028-01-01' });
    const r = scored(scoreLeaseRisk(subject, all, property(), AS_OF));
    expect(r.components.reduce((n, c) => n + c.points, 0)).toBeCloseTo(r.score, 10);
    expect(r.components.every((c) => c.detail.length > 0)).toBe(true);
  });

  it('shows an expired lease as expired, not as zero months left', () => {
    const { subject, all } = withShare({ expirationDate: '2025-01-01' });
    const r = scored(scoreLeaseRisk(subject, all, property(), AS_OF));
    expect(r.components[0]!.detail).toBe('Expired 365 days ago');
  });

  it('combines a multi-suite tenant when scoring concentration', () => {
    const one = lease({ id: '1', tenantName: 'Acme L.L.C.', annualRentCents: 10 });
    const two = lease({ id: '2', tenantName: 'Acme LLC', annualRentCents: 10 });
    const other = lease({ id: '3', tenantName: 'Other', annualRentCents: 60 });
    const r = scored(scoreLeaseRisk(one, [one, two, other], property(), AS_OF));
    expect(r.components.find((c) => c.key === 'concentration')!.detail).toMatch(/^25\.0%/);
  });

  it('says when missing rents leave concentration incomplete', () => {
    const solo = lease({ tenantName: 'Solo' });
    const blank = lease({ id: 'x', tenantName: 'Other', annualRentCents: null });
    const r = scored(scoreLeaseRisk(solo, [solo, blank], property(), AS_OF));
    expect(r.components.find((c) => c.key === 'concentration')!.detail).toMatch(/1 lease with no rent/);
  });

  it('treats a blank tenant name as missing', () => {
    const s = lease({ tenantName: '   ' });
    expect(scoreLeaseRisk(s, [s], property(), AS_OF).scored).toBe(false);
  });

  it('refuses invalid weights rather than produce a nonsense score', () => {
    const { subject, all } = withShare({});
    const nan = { ...DEFAULT_RISK_WEIGHTS, concentration: Number.NaN };
    const negative = { time_to_expiry: -50, notice_urgency: 0, concentration: 150, loan_mismatch: 0 };
    expect(() => scoreLeaseRisk(subject, all, property(), AS_OF, nan)).toThrow(RangeError);
    expect(() => scoreLeaseRisk(subject, all, property(), AS_OF, negative)).toThrow(RangeError);
    expect(() => scoreRentRoll(all, property(), AS_OF, nan)).toThrow(RangeError);
  });

  it('scores a whole rent roll the same as one by one', () => {
    const { subject, all } = withShare({ expirationDate: '2028-01-01' });
    const [first] = scoreRentRoll(all, property(), AS_OF);
    expect(first).toEqual(scoreLeaseRisk(subject, all, property(), AS_OF));
  });

  it('honours custom weights', () => {
    const { subject, all } = withShare({ expirationDate: '2027-01-01', noticeMonths: 12 });
    const weights = { time_to_expiry: 0, notice_urgency: 0, concentration: 100, loan_mismatch: 0 };
    expect(scored(scoreLeaseRisk(subject, all, property(), AS_OF, weights)).score).toBeCloseTo(80, 10);
  });

  it('is not scored when every available component has zero weight', () => {
    const { subject, all } = withShare({ noticeMonths: null });
    const weights = { time_to_expiry: 0, notice_urgency: 100, concentration: 0, loan_mismatch: 0 };
    expect(scoreLeaseRisk(subject, all, property(), AS_OF, weights).scored).toBe(false);
  });
});

describe('validateRiskWeights', () => {
  it('accepts the defaults', () => {
    expect(validateRiskWeights(DEFAULT_RISK_WEIGHTS)).toBeNull();
  });
  it('rejects a wrong total, a bad value or a missing key', () => {
    expect(validateRiskWeights({ ...DEFAULT_RISK_WEIGHTS, concentration: 26 })).toMatch(/total 100/);
    expect(validateRiskWeights({ ...DEFAULT_RISK_WEIGHTS, concentration: -1 })).toMatch(/between/);
    expect(validateRiskWeights({ time_to_expiry: 100 })).toMatch(/between/);
  });
});
