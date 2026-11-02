import { describe, expect, it } from 'vitest';
import {
  largestTenantMismatch,
  normalizeTenantName,
  rolloverSchedule,
  tenantConcentration,
  walt,
} from '../../src/domain/entities/rollover';
import { lease, property } from './fixtures';

const A = lease({
  id: 'a',
  tenantName: 'A',
  areaSf: 10_000,
  annualRentCents: 30_000_000,
  expirationDate: '2029-01-01',
});
const B = lease({
  id: 'b',
  tenantName: 'B',
  areaSf: 30_000,
  annualRentCents: 60_000_000,
  expirationDate: '2027-01-01',
});
const AS_OF = '2026-01-01';

describe('walt', () => {
  it('matches the worked example by area and by rent', () => {
    const r = walt([A, B], AS_OF);
    expect(r.byArea.years).toBeCloseTo(1.49966, 4);
    expect(r.byRent.years).toBeCloseTo(1.66644, 4);
    expect(r.byArea.includedLeases).toBe(2);
  });
  it('excludes and counts a lease missing its weight or term', () => {
    const r = walt([A, lease({ id: 'c', areaSf: null }), lease({ id: 'd', expirationDate: null })], AS_OF);
    expect(r.byArea.includedLeases).toBe(1);
    expect(r.byArea.excludedLeases).toBe(2);
    expect(r.byArea.years).toBeCloseTo(1096 / 365.25, 10);
  });
  it('ignores vacant suites and counts month-to-month as zero term', () => {
    const vacant = lease({ id: 'v', status: 'vacant', areaSf: 50_000 });
    const mtm = lease({ id: 'm', areaSf: 10_000, isMonthToMonth: true, expirationDate: null });
    const r = walt([A, vacant, mtm], AS_OF);
    expect(r.byArea.excludedLeases).toBe(0);
    expect(r.byArea.years).toBeCloseTo(1096 / 365.25 / 2, 10);
  });
  it('treats a zero weight as excluded', () => {
    const r = walt([lease({ areaSf: 0 })], AS_OF);
    expect(r.byArea).toEqual({ years: null, includedLeases: 0, excludedLeases: 1 });
  });
  it('is null, not zero, when nothing can be measured', () => {
    expect(walt([], AS_OF).byRent.years).toBeNull();
    expect(walt([lease({ annualRentCents: null })], AS_OF).byRent.years).toBeNull();
  });
});

describe('rolloverSchedule', () => {
  it('buckets by year with shares and running totals', () => {
    const r = rolloverSchedule([A, B], AS_OF);
    expect(r.years.map((y) => y.year)).toEqual([2026, 2027, 2028, 2029]);
    const y2027 = r.years[1]!;
    expect(y2027.areaSf).toBe(30_000);
    expect(y2027.rentShare).toBeCloseTo(600 / 900, 10);
    expect(y2027.cumulativeRentShare).toBeCloseTo(600 / 900, 10);
    expect(r.years[2]!.leases).toBe(0);
    expect(r.years[3]!.cumulativeAreaShare).toBeCloseTo(1, 10);
    expect(r.totals).toEqual({ leases: 2, areaSf: 40_000, annualRentCents: 90_000_000 });
  });
  it('puts month-to-month and expired ahead of the years, in the running total', () => {
    const mtm = lease({
      id: 'm',
      areaSf: 10_000,
      annualRentCents: 10_000_000,
      isMonthToMonth: true,
      expirationDate: null,
    });
    const old = lease({ id: 'o', areaSf: 10_000, annualRentCents: 10_000_000, expirationDate: '2025-06-30' });
    const onDay = lease({ id: 'd', areaSf: 10_000, annualRentCents: 10_000_000, expirationDate: AS_OF });
    const r = rolloverSchedule([mtm, old, onDay, A], AS_OF);
    expect(r.mtmOrExpired.leases).toBe(3);
    expect(r.mtmOrExpired.rentShare).toBeCloseTo(30 / 60, 10);
    expect(r.years.at(-1)!.cumulativeRentShare).toBeCloseTo(1, 10);
  });
  it('reports a lease with no expiration instead of hiding it', () => {
    const r = rolloverSchedule([A, lease({ id: 'u', expirationDate: null, areaSf: 5_000 })], AS_OF);
    expect(r.unknownExpiration.leases).toBe(1);
    expect(r.unknownExpiration.areaSf).toBe(5_000);
    expect(r.totals.leases).toBe(2);
    expect(r.years.at(-1)!.cumulativeAreaShare).toBeCloseTo(10 / 15, 10);
  });
  it('counts missing inputs', () => {
    const r = rolloverSchedule([lease({ areaSf: null }), lease({ annualRentCents: null })], AS_OF);
    expect(r.leasesMissingArea).toBe(1);
    expect(r.leasesMissingRent).toBe(1);
  });
  it('handles an empty rent roll without dividing by zero', () => {
    const r = rolloverSchedule([], AS_OF);
    expect(r.years).toHaveLength(1);
    expect(r.years[0]!.rentShare).toBeNull();
  });
  it('puts a mistyped far-future year beyond the horizon', () => {
    const r = rolloverSchedule([A, lease({ id: 'x', expirationDate: '9999-12-31' })], AS_OF);
    expect(r.years.at(-1)!.year).toBe(2029);
    expect(r.beyondHorizon.leases).toBe(1);
    expect(r.beyondHorizon.cumulativeAreaShare).toBeCloseTo(1, 10);
  });
  it('keeps vacant suites out of leased totals', () => {
    expect(rolloverSchedule([A, lease({ status: 'vacant' })], AS_OF).totals.leases).toBe(1);
  });
});

describe('tenantConcentration', () => {
  it('combines suites of one tenant despite spelling differences', () => {
    const r = tenantConcentration([
      lease({ id: '1', tenantName: 'Acme Holdings, LLC', annualRentCents: 25_000_000 }),
      lease({ id: '2', tenantName: 'ACME HOLDINGS', annualRentCents: 25_000_000 }),
      lease({ id: '3', tenantName: 'Beta Inc.', annualRentCents: 50_000_000 }),
    ]);
    expect(r.tenants).toHaveLength(2);
    expect(r.tenants.map((t) => t.share)).toEqual([0.5, 0.5]);
    expect(r.tenants.find((t) => t.suites === 2)).toBeTruthy();
  });
  it('sorts largest first', () => {
    const r = tenantConcentration([A, B]);
    expect(r.tenants[0]!.tenant).toBe('B');
    expect(r.tenants[0]!.share).toBeCloseTo(2 / 3, 10);
  });
  it('is empty when no rent is recorded', () => {
    expect(tenantConcentration([lease({ annualRentCents: null })]).tenants).toEqual([]);
  });
  it('normalizes names', () => {
    expect(normalizeTenantName('  Foo & Bar, Inc. ')).toBe('foo bar');
  });
  it('removes dotted legal suffixes', () => {
    expect(normalizeTenantName('Acme Holdings, L.L.C.')).toBe('acme holdings');
    expect(normalizeTenantName('Acme L.P.')).toBe('acme');
    expect(normalizeTenantName('Acme Holdings Co., Inc.')).toBe('acme holdings');
  });
  it('removes suffixes only at the end, and never reduces a name to nothing', () => {
    expect(normalizeTenantName('Co Op Foods')).toBe('co op foods');
    expect(normalizeTenantName('LLC')).toBe('llc');
    expect(normalizeTenantName('Inc.')).toBe('inc');
  });
  it('counts what it had to leave out', () => {
    const r = tenantConcentration([
      lease({ id: '1', tenantName: 'Solo', annualRentCents: 100 }),
      lease({ id: '2', tenantName: 'Other', annualRentCents: null }),
      lease({ id: '3', tenantName: '   ', annualRentCents: 100 }),
    ]);
    expect(r.leasesMissingRent).toBe(1);
    expect(r.leasesMissingName).toBe(1);
    expect(r.tenants).toHaveLength(1);
    expect(r.tenants[0]!.share).toBe(0.5);
  });
});

describe('largestTenantMismatch', () => {
  const big = { tenantName: 'Big', annualRentCents: 90 };
  const small = lease({ id: 's', tenantName: 'Small', annualRentCents: 10, expirationDate: '2040-01-01' });
  it('names the biggest rent payer and whether it leaves first', () => {
    const early = lease({ id: 'b', ...big, expirationDate: '2027-01-01' });
    expect(largestTenantMismatch([early, small], property())).toEqual({ tenant: 'Big', expiresFirst: true });
    const late = lease({ id: 'b', ...big, expirationDate: '2030-01-01' });
    expect(largestTenantMismatch([late, small], property())).toEqual({ tenant: 'Big', expiresFirst: false });
  });
  it('counts any suite expiring first, across a multi-suite tenant', () => {
    const one = lease({ id: '1', ...big, expirationDate: '2030-01-01' });
    const two = lease({ id: '2', ...big, expirationDate: '2027-01-01' });
    expect(largestTenantMismatch([one, two, small], property())?.expiresFirst).toBe(true);
  });
  it('is unknown without a maturity, and null with no rents', () => {
    const b = lease({ id: 'b', ...big });
    expect(largestTenantMismatch([b], property({ loanMaturityDate: null }))?.expiresFirst).toBeNull();
    expect(largestTenantMismatch([], property())).toBeNull();
  });
});
