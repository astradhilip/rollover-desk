/**
 * Estimates only: actual fees follow each listing agreement. Rates are analyst assumptions in basis
 * points, passed in, with no fallback, so a missing rate can't silently become a number.
 */
export interface CommissionEstimate {
  rateBps: number;
  byYear: { year: number; rentCents: number; commissionCents: number }[];
  totalRentCents: number;
  totalCommissionCents: number;
}

/** `rentByLeaseYearCents` is the base rent for each lease year, so steps are honoured. Rounds each year to a cent. */
export function estimateCommission(rentByLeaseYearCents: number[], rateBps: number): CommissionEstimate {
  if (!Number.isFinite(rateBps) || rateBps < 0 || rateBps > 10_000) {
    throw new RangeError(`Commission rate out of range: ${rateBps} bps`);
  }
  if (rentByLeaseYearCents.length === 0) throw new RangeError('A lease needs at least one year of rent.');
  for (const rent of rentByLeaseYearCents) {
    if (!Number.isSafeInteger(rent) || rent < 0) throw new RangeError(`Invalid rent: ${rent} cents`);
  }
  const byYear = rentByLeaseYearCents.map((rentCents, i) => ({
    year: i + 1,
    rentCents,
    commissionCents: Math.round((rentCents * rateBps) / 10_000),
  }));
  return {
    rateBps,
    byYear,
    totalRentCents: byYear.reduce((n, y) => n + y.rentCents, 0),
    totalCommissionCents: byYear.reduce((n, y) => n + y.commissionCents, 0),
  };
}

export interface SideRates {
  landlordRepBps: number;
  tenantRepBps: number;
}

export interface DealCommission {
  landlordRep: CommissionEstimate;
  tenantRep: CommissionEstimate;
  totalCommissionCents: number;
}

function dealCommission(rents: number[], rates: SideRates): DealCommission {
  const landlordRep = estimateCommission(rents, rates.landlordRepBps);
  const tenantRep = estimateCommission(rents, rates.tenantRepBps);
  return {
    landlordRep,
    tenantRep,
    totalCommissionCents: landlordRep.totalCommissionCents + tenantRep.totalCommissionCents,
  };
}

export interface RenewalVsReplacement {
  renewal: DealCommission;
  replacement: DealCommission;
}

/** Flat rent for the term, with a rate per deal type and broker side: a first estimate for the pipeline. */
export function renewalVsReplacement(
  annualRentCents: number,
  termYears: number,
  rates: { renewal: SideRates; replacement: SideRates },
): RenewalVsReplacement {
  if (!Number.isInteger(termYears) || termYears < 1) throw new RangeError(`Invalid term: ${termYears}`);
  const rents = Array.from({ length: termYears }, () => annualRentCents);
  return {
    renewal: dealCommission(rents, rates.renewal),
    replacement: dealCommission(rents, rates.replacement),
  };
}
