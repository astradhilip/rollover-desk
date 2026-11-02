import { describe, expect, it } from 'vitest';
import { estimateCommission, renewalVsReplacement } from '../../src/domain/entities/commission';

const RATES = {
  replacement: { landlordRepBps: 400, tenantRepBps: 200 },
  renewal: { landlordRepBps: 200, tenantRepBps: 100 },
};

describe('estimateCommission', () => {
  it('matches the worked examples', () => {
    const r = renewalVsReplacement(10_000_000, 5, RATES);
    expect(r.replacement.totalCommissionCents).toBe(3_000_000); // $30,000
    expect(r.renewal.totalCommissionCents).toBe(1_500_000); // $15,000
    expect(r.replacement.landlordRep.totalCommissionCents).toBe(2_000_000);
    expect(r.replacement.tenantRep.totalCommissionCents).toBe(1_000_000);
    expect(r.renewal.landlordRep.byYear).toHaveLength(5);
  });
  it('honours rent steps year by year', () => {
    const r = estimateCommission([10_000_000, 10_300_000], 600);
    expect(r.byYear.map((y) => y.commissionCents)).toEqual([600_000, 618_000]);
    expect(r.totalRentCents).toBe(20_300_000);
  });
  it('rounds each year to a whole cent', () => {
    expect(estimateCommission([333], 333).totalCommissionCents).toBe(11);
  });
  it('rejects a rate or term out of range', () => {
    expect(() => estimateCommission([1], -1)).toThrow(RangeError);
    expect(() => estimateCommission([1], 10_001)).toThrow(RangeError);
    expect(() => estimateCommission([1], Number.NaN)).toThrow(RangeError);
    expect(() => renewalVsReplacement(1, 0, RATES)).toThrow(RangeError);
  });
  it('refuses missing or invalid rent rather than calling it zero', () => {
    expect(() => renewalVsReplacement(null as unknown as number, 5, RATES)).toThrow(RangeError);
    expect(() => estimateCommission([Number.NaN], 100)).toThrow(RangeError);
    expect(() => estimateCommission([-100], 100)).toThrow(RangeError);
    expect(() => estimateCommission([], 100)).toThrow(RangeError);
  });
});
