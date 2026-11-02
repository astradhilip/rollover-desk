import { daysBetween } from './dates';
import { type Lease } from './Lease';
import { tenantKey } from './rollover';

export const RENEWAL_STAGES = [
  'identified',
  'contacted',
  'proposal',
  'negotiating',
  'renewed',
  'backfilled',
  'vacating',
] as const;
export type RenewalStage = (typeof RENEWAL_STAGES)[number];

export interface RenewalDeal {
  suite: string;
  /** A new tenant in the suite starts over, rather than inheriting the old tenant's deal. */
  tenantKey: string;
  stage: RenewalStage;
  vacatingReason: string | null;
  note: string | null;
}

export interface PipelineEntry {
  lease: Lease;
  stage: RenewalStage;
  vacatingReason: string | null;
  note: string | null;
}

const PIPELINE_DAYS = 730;

export const dealFor = (lease: Lease, deals: RenewalDeal[]): RenewalDeal | null => {
  const key = tenantKey(lease);
  return deals.find((d) => d.suite === lease.suite && d.tenantKey === key) ?? null;
};

/** Leases within two years of expiry or month-to-month, plus any with a deal already started. */
export function renewalPipeline(leases: Lease[], deals: RenewalDeal[], asOf: string): PipelineEntry[] {
  const entries: PipelineEntry[] = [];
  for (const lease of leases) {
    if (lease.status !== 'occupied') continue;
    const deal = dealFor(lease, deals);
    const near =
      lease.isMonthToMonth ||
      (lease.expirationDate !== null && daysBetween(asOf, lease.expirationDate) <= PIPELINE_DAYS);
    if (!near && !deal) continue;
    entries.push({
      lease,
      stage: deal?.stage ?? 'identified',
      vacatingReason: deal?.vacatingReason ?? null,
      note: deal?.note ?? null,
    });
  }
  return entries.sort((a, b) => (a.lease.expirationDate ?? '').localeCompare(b.lease.expirationDate ?? ''));
}

/** Null when the move is allowed, else why not. A Vacating outcome must say why. */
export function validateMove(
  lease: Lease | undefined,
  stage: RenewalStage,
  reason: string | null,
): string | null {
  if (!lease) return 'No such suite in the current rent roll.';
  if (lease.status !== 'occupied') return 'The suite is vacant.';
  if (!tenantKey(lease)) return 'The suite has no recorded tenant.';
  if (stage === 'vacating' && !reason?.trim()) return 'Say why the tenant is vacating.';
  return null;
}
