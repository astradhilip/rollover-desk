import { addMonths, daysBetween } from './dates';

/**
 * One rent roll row. `null` always means "not recorded": nothing in the domain imputes a value,
 * and each metric reports what it had to exclude.
 */
export interface Lease {
  id: string;
  suite: string;
  tenantName: string | null;
  status: 'occupied' | 'vacant';
  areaSf: number | null;
  /** In-place annual base rent. */
  annualRentCents: number | null;
  expirationDate: string | null;
  isMonthToMonth: boolean;
  /** Months before expiration by which renewal notice is due. */
  noticeMonths: number | null;
  rentSteps: RentStep[];
}

export interface RentStep {
  date: string;
  annualRentCents: number;
}

export interface Property {
  id: string;
  name: string;
  loanMaturityDate: string | null;
  /** Analyst assumption per property; never inferred. */
  marketRentPsfCents: number | null;
}

const DAYS_PER_YEAR = 365.25;

export const occupied = (leases: Lease[]): Lease[] => leases.filter((l) => l.status === 'occupied');

/** Remaining term in years. Expired and month-to-month leases count 0; unknown or vacant is null. */
export function remainingYears(lease: Lease, asOf: string): number | null {
  if (lease.status === 'vacant') return null;
  if (lease.isMonthToMonth) return 0;
  if (!lease.expirationDate) return null;
  return Math.max(0, daysBetween(asOf, lease.expirationDate) / DAYS_PER_YEAR);
}

/**
 * Null means absent: no valid notice term, no expiration, month-to-month, or vacant. Absence is reported,
 * not assumed. A notice term that isn't a whole, non-negative number of months can't give a real deadline.
 */
export function noticeDate(lease: Lease): string | null {
  const months = lease.noticeMonths;
  if (lease.status === 'vacant' || lease.isMonthToMonth || !lease.expirationDate) return null;
  if (months === null || !Number.isInteger(months) || months < 0) return null;
  return addMonths(lease.expirationDate, -months);
}

/**
 * Null when the term or loan maturity is unknown, because a mismatch can't then be determined.
 * Month-to-month counts as true: it has no committed term past maturity.
 */
export function expiresBeforeLoanMaturity(lease: Lease, property: Property): boolean | null {
  if (lease.status === 'vacant' || !property.loanMaturityDate) return null;
  if (lease.isMonthToMonth) return true;
  if (!lease.expirationDate) return null;
  return daysBetween(lease.expirationDate, property.loanMaturityDate) > 0;
}

/** Positive means in-place rent is below market. Null when vacant or any input is missing or zero. */
export function markToMarketPct(lease: Lease, marketRentPsfCents: number | null): number | null {
  if (lease.status === 'vacant' || !marketRentPsfCents || !lease.annualRentCents || !lease.areaSf)
    return null;
  const inPlacePsf = lease.annualRentCents / lease.areaSf;
  return (marketRentPsfCents - inPlacePsf) / inPlacePsf;
}
