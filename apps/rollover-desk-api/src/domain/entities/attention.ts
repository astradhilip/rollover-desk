import { criticalDates, describeCriticalDate } from './criticalDates';
import { daysBetween } from './dates';
import { noticeDate, type Lease, type Property } from './Lease';
import type { RiskResult } from './risk';
import { largestTenantMismatch, tenantKey } from './rollover';
import type { RenewalStage } from './renewal';

export type AttentionSeverity = 'high' | 'medium' | 'low';

export type AttentionKind =
  | 'notice_passed'
  | 'notice_soon'
  | 'expired'
  | 'expires_soon'
  | 'month_to_month'
  | 'no_renewal_activity'
  | 'not_scored'
  | 'largest_tenant_expires_first';

export interface AttentionItem {
  /** Stable across reloads. A changed date, tenant or data gap gets a new key, so it comes back. */
  key: string;
  kind: AttentionKind;
  severity: AttentionSeverity;
  suite: string | null;
  leaseId: string | null;
  tenantName: string | null;
  message: string;
  /** Sorts within a severity: most overdue first. Null when undated. */
  daysAway: number | null;
}

const NOTICE_SOON_DAYS = 90;
const EXPIRES_SOON_DAYS = 180;
const NO_ACTIVITY_DAYS = 365;
const RANK: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };

/** FNV-1a. Pure and short; keys sit in URLs and logs, so they carry no readable tenant name. */
const hash = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};
const keyOf = (kind: AttentionKind, identity: string, date: string) => `${kind}.${hash(identity)}.${date}`;

/**
 * What needs a person, across a property. "No renewal activity" is the cracks check: a lease close to expiry
 * that nobody has moved past Identified.
 */
export function attentionQueue(
  leases: Lease[],
  property: Property,
  asOf: string,
  risks: Map<string, RiskResult>,
  stages: Map<string, RenewalStage>,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const lease of leases) {
    if (lease.status !== 'occupied') continue;
    const add = (
      kind: AttentionKind,
      severity: AttentionSeverity,
      message: string,
      date: string,
      daysAway: number | null,
      detail = '',
    ) =>
      items.push({
        key: keyOf(kind, `${lease.suite}|${tenantKey(lease) ?? ''}|${detail}`, date),
        kind,
        severity,
        suite: lease.suite,
        leaseId: lease.id,
        tenantName: lease.tenantName,
        message,
        daysAway,
      });

    const closed = ['renewed', 'backfilled', 'vacating'].includes(stages.get(lease.id) ?? '');
    const moved = (stages.get(lease.id) ?? 'identified') !== 'identified';
    const toExpiry = lease.expirationDate ? daysBetween(asOf, lease.expirationDate) : null;
    const notice = noticeDate(lease);
    const toNotice = notice ? daysBetween(asOf, notice) : null;
    const dates = criticalDates(lease, property, asOf);

    if (lease.isMonthToMonth && !closed) {
      add('month_to_month', 'medium', 'Month-to-month: the tenant can leave on short notice.', 'mtm', 0);
    }
    if (toExpiry !== null && toExpiry < 0 && !closed) {
      add(
        'expired',
        'high',
        `Expired ${-toExpiry} days ago and not marked as holdover.`,
        lease.expirationDate!,
        toExpiry,
      );
    } else if (toExpiry !== null && !closed) {
      if (toNotice !== null && toNotice < 0 && !moved) {
        add(
          'notice_passed',
          'high',
          `Renewal notice date passed ${-toNotice} days ago with no renewal activity.`,
          notice!,
          toNotice,
        );
      } else if (toNotice !== null && toNotice >= 0 && toNotice <= NOTICE_SOON_DAYS) {
        const entry = dates.upcoming.find((d) => d.kind === 'notice')!;
        add('notice_soon', 'high', describeCriticalDate(entry), notice!, toNotice);
      }
      if (toExpiry <= EXPIRES_SOON_DAYS) {
        const entry = dates.upcoming.find((d) => d.kind === 'expiration')!;
        add('expires_soon', 'medium', describeCriticalDate(entry), lease.expirationDate!, toExpiry);
      }
      if (toExpiry <= NO_ACTIVITY_DAYS && !moved) {
        add(
          'no_renewal_activity',
          'medium',
          `Expires in ${toExpiry} days and nobody has started a renewal.`,
          lease.expirationDate!,
          toExpiry,
        );
      }
    }
    const risk = risks.get(lease.id);
    if (risk && !risk.scored)
      add('not_scored', 'low', `Not scored: ${risk.reasons.join(' ')}`, 'data', null, risk.reasons.join(' '));
  }

  const largest = largestTenantMismatch(leases, property);
  if (largest?.expiresFirst) {
    items.push({
      key: keyOf('largest_tenant_expires_first', largest.tenant, property.loanMaturityDate!),
      kind: 'largest_tenant_expires_first',
      severity: 'high',
      suite: null,
      leaseId: null,
      tenantName: largest.tenant,
      message: `Largest tenant ${largest.tenant} has a lease ending before the ${property.loanMaturityDate} loan maturity.`,
      daysAway: null,
    });
  }
  return items.sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      (a.daysAway ?? Number.MAX_SAFE_INTEGER) - (b.daysAway ?? Number.MAX_SAFE_INTEGER) ||
      a.key.localeCompare(b.key),
  );
}
