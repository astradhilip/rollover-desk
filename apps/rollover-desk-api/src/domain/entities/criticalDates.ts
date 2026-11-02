import { daysBetween } from './dates';
import { type Lease, noticeDate, type Property } from './Lease';

export type CriticalDateKind = 'notice' | 'rent_step' | 'expiration' | 'loan_maturity';

export interface CriticalDate {
  kind: CriticalDateKind;
  label: string;
  date: string;
  /** Negative when the date has passed. */
  daysAway: number;
}

export interface CriticalDatePartition {
  passed: CriticalDate[];
  upcoming: CriticalDate[];
  /** Tracked dates with nothing recorded. Shown so that silence isn't read as safety. */
  absent: ('notice' | 'expiration' | 'loan_maturity')[];
  next: CriticalDate | null;
}

export function criticalDates(lease: Lease, property: Property, asOf: string): CriticalDatePartition {
  const dated: CriticalDate[] = [];
  const absent: CriticalDatePartition['absent'] = [];
  const add = (kind: CriticalDateKind, label: string, date: string) =>
    dated.push({ kind, label, date, daysAway: daysBetween(asOf, date) });

  // A vacant suite has no lease dates, and month-to-month has no fixed expiry or notice date by definition.
  if (lease.status === 'occupied' && !lease.isMonthToMonth) {
    const notice = noticeDate(lease);
    if (notice) add('notice', 'Renewal notice due', notice);
    else absent.push('notice');

    if (lease.expirationDate) add('expiration', 'Lease expiration', lease.expirationDate);
    else absent.push('expiration');
  }
  if (lease.status === 'occupied') {
    for (const step of lease.rentSteps) add('rent_step', 'Rent step', step.date);
  }

  if (property.loanMaturityDate) add('loan_maturity', 'Loan maturity', property.loanMaturityDate);
  else absent.push('loan_maturity');

  const passed = dated.filter((d) => d.daysAway < 0).sort((a, b) => b.daysAway - a.daysAway);
  const upcoming = dated.filter((d) => d.daysAway >= 0).sort((a, b) => a.daysAway - b.daysAway);
  return { passed, upcoming, absent, next: upcoming[0] ?? null };
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** A sentence for the attention queue. */
export function describeCriticalDate(d: CriticalDate): string {
  if (d.daysAway === 0) return `${d.label} is today`;
  return d.daysAway < 0
    ? `${d.label} passed ${plural(-d.daysAway, 'day')} ago`
    : `${d.label} in ${plural(d.daysAway, 'day')}`;
}
