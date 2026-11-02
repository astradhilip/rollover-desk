import { yearOf } from './dates';
import { expiresBeforeLoanMaturity, type Lease, occupied, type Property, remainingYears } from './Lease';

export interface WeightedTerm {
  /** Null when no lease had the inputs. */
  years: number | null;
  includedLeases: number;
  excludedLeases: number;
}

export interface Walt {
  byArea: WeightedTerm;
  byRent: WeightedTerm;
}

function weighted(leases: Lease[], asOf: string, weightOf: (l: Lease) => number | null): WeightedTerm {
  let sum = 0;
  let total = 0;
  let included = 0;
  for (const lease of leases) {
    const weight = weightOf(lease);
    const years = remainingYears(lease, asOf);
    if (!weight || years === null) continue;
    sum += weight * years;
    total += weight;
    included += 1;
  }
  return {
    years: total > 0 ? sum / total : null,
    includedLeases: included,
    excludedLeases: leases.length - included,
  };
}

export function walt(leases: Lease[], asOf: string): Walt {
  const live = occupied(leases);
  return {
    byArea: weighted(live, asOf, (l) => l.areaSf),
    byRent: weighted(live, asOf, (l) => l.annualRentCents),
  };
}

export interface RolloverBucket {
  leases: number;
  areaSf: number;
  annualRentCents: number;
  /** Share of total leased area and rent, 0 to 1. Null when the total is zero. */
  areaShare: number | null;
  rentShare: number | null;
  cumulativeAreaShare: number | null;
  cumulativeRentShare: number | null;
}

export interface RolloverSchedule {
  /** Month-to-month and already expired: at risk now, so listed ahead of the years. */
  mtmOrExpired: RolloverBucket;
  years: ({ year: number } & RolloverBucket)[];
  /** Expiring after the horizon. A mistyped year lands here rather than producing thousands of rows. */
  beyondHorizon: RolloverBucket;
  /** Occupied with no recorded expiration: part of the totals, in no year. */
  unknownExpiration: { leases: number; areaSf: number; annualRentCents: number };
  totals: { leases: number; areaSf: number; annualRentCents: number };
  /** Rows counted in the totals with area or rent missing. */
  leasesMissingArea: number;
  leasesMissingRent: number;
}

const HORIZON_YEARS = 30;
const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

/** Calendar years run from the as-of year through the last expiration, with empty years kept visible. */
export function rolloverSchedule(leases: Lease[], asOf: string): RolloverSchedule {
  const live = occupied(leases);
  const totals = {
    leases: live.length,
    areaSf: live.reduce((n, l) => n + (l.areaSf ?? 0), 0),
    annualRentCents: live.reduce((n, l) => n + (l.annualRentCents ?? 0), 0),
  };
  const isCurrent = (l: Lease) => !l.isMonthToMonth && !!l.expirationDate && remainingYears(l, asOf)! > 0;

  let cumArea = 0;
  let cumRent = 0;
  const bucket = (group: Lease[]): RolloverBucket => {
    const areaSf = group.reduce((n, l) => n + (l.areaSf ?? 0), 0);
    const annualRentCents = group.reduce((n, l) => n + (l.annualRentCents ?? 0), 0);
    cumArea += areaSf;
    cumRent += annualRentCents;
    return {
      leases: group.length,
      areaSf,
      annualRentCents,
      areaShare: ratio(areaSf, totals.areaSf),
      rentShare: ratio(annualRentCents, totals.annualRentCents),
      cumulativeAreaShare: ratio(cumArea, totals.areaSf),
      cumulativeRentShare: ratio(cumRent, totals.annualRentCents),
    };
  };

  const mtmOrExpired = bucket(live.filter((l) => l.isMonthToMonth || (!!l.expirationDate && !isCurrent(l))));
  const firstYear = yearOf(asOf);
  const horizon = firstYear + HORIZON_YEARS;
  const byYear = new Map<number, Lease[]>();
  const later: Lease[] = [];
  for (const lease of live.filter(isCurrent)) {
    const year = yearOf(lease.expirationDate!);
    if (year > horizon) later.push(lease);
    else byYear.set(year, [...(byYear.get(year) ?? []), lease]);
  }
  const lastYear = Math.max(firstYear, ...byYear.keys());
  const years: RolloverSchedule['years'] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    years.push({ year, ...bucket(byYear.get(year) ?? []) });
  }

  const unknown = live.filter((l) => !l.isMonthToMonth && !l.expirationDate);
  return {
    mtmOrExpired,
    years,
    beyondHorizon: bucket(later),
    unknownExpiration: {
      leases: unknown.length,
      areaSf: unknown.reduce((n, l) => n + (l.areaSf ?? 0), 0),
      annualRentCents: unknown.reduce((n, l) => n + (l.annualRentCents ?? 0), 0),
    },
    totals,
    leasesMissingArea: live.filter((l) => l.areaSf === null).length,
    leasesMissingRent: live.filter((l) => l.annualRentCents === null).length,
  };
}

export interface TenantShare {
  key: string;
  tenant: string;
  annualRentCents: number;
  share: number;
  suites: number;
}

export interface Concentration {
  /** Largest first. */
  tenants: TenantShare[];
  /** Left out of every share, so shares may be overstated when this is above zero. */
  leasesMissingRent: number;
  /** In the rent total, but in no tenant's share. */
  leasesMissingName: number;
}

const LEGAL_SUFFIX = /\s(incorporated|inc|llc|llp|lp|ltd|corp|corporation|co|company)$/;

/**
 * Groups suites of one tenant despite differences in case, punctuation and legal suffix. Only trailing
 * suffixes are removed, and a name is never reduced to nothing, so "Co Op Foods" and "LLC" keep their identity.
 */
export function normalizeTenantName(name: string): string {
  let out = name
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/[,&/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  while (LEGAL_SUFFIX.test(out)) out = out.replace(LEGAL_SUFFIX, '');
  return out;
}

/** A name that is blank or only punctuation is not a recorded name. */
export const tenantKey = (lease: Lease): string | null =>
  lease.tenantName ? normalizeTenantName(lease.tenantName) || null : null;

export function tenantConcentration(leases: Lease[]): Concentration {
  const live = occupied(leases);
  const rented = live.filter((l) => l.annualRentCents !== null);
  const total = rented.reduce((n, l) => n + l.annualRentCents!, 0);
  const byTenant = new Map<string, TenantShare>();
  let leasesMissingName = 0;
  for (const lease of rented) {
    const key = tenantKey(lease);
    if (!key) {
      leasesMissingName += 1;
      continue;
    }
    const entry = byTenant.get(key) ?? {
      key,
      tenant: lease.tenantName!.trim(),
      annualRentCents: 0,
      share: 0,
      suites: 0,
    };
    entry.annualRentCents += lease.annualRentCents!;
    entry.suites += 1;
    entry.share = total > 0 ? entry.annualRentCents / total : 0;
    byTenant.set(key, entry);
  }
  return {
    tenants: total > 0 ? [...byTenant.values()].sort((a, b) => b.annualRentCents - a.annualRentCents) : [],
    leasesMissingRent: live.length - rented.length,
    leasesMissingName,
  };
}

export interface LargestTenantMismatch {
  tenant: string;
  /** True if any of the tenant's suites expires before loan maturity. Null when that can't be determined. */
  expiresFirst: boolean | null;
}

/** The headline capital markets question: does the biggest rent payer leave before the loan comes due? */
export function largestTenantMismatch(leases: Lease[], property: Property): LargestTenantMismatch | null {
  const top = tenantConcentration(leases).tenants[0];
  if (!top) return null;
  const results = occupied(leases)
    .filter((l) => tenantKey(l) === top.key)
    .map((l) => expiresBeforeLoanMaturity(l, property));
  const expiresFirst = results.includes(true) ? true : results.includes(null) ? null : false;
  return { tenant: top.tenant, expiresFirst };
}
