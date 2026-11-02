import { daysBetween } from './dates';
import { expiresBeforeLoanMaturity, type Lease, noticeDate, type Property, remainingYears } from './Lease';
import { type Concentration, tenantConcentration, tenantKey } from './rollover';

export type RiskComponentKey = 'time_to_expiry' | 'notice_urgency' | 'concentration' | 'loan_mismatch';

export type RiskWeights = Record<RiskComponentKey, number>;

/** Judgment defaults to validate with users, not an industry standard. Analysts can change them. */
export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  time_to_expiry: 40,
  notice_urgency: 20,
  concentration: 25,
  loan_mismatch: 15,
};

const LABELS: Record<RiskComponentKey, string> = {
  time_to_expiry: 'Time to expiry',
  notice_urgency: 'Notice urgency',
  concentration: 'Tenant concentration',
  loan_mismatch: 'Expires before loan maturity',
};

const CONCENTRATION_CEILING = 0.25;

export function validateRiskWeights(weights: Record<string, unknown>): string | null {
  const keys = Object.keys(DEFAULT_RISK_WEIGHTS);
  for (const key of keys) {
    const value = weights[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      return `Weight ${key} must be between 0 and 100.`;
    }
  }
  const sum = keys.reduce((n, key) => n + (weights[key] as number), 0);
  return Math.abs(sum - 100) < 1e-9 ? null : `Weights must total 100 (got ${sum}).`;
}

export interface RiskComponent {
  key: RiskComponentKey;
  label: string;
  /** The weight as configured. */
  weight: number;
  /** The weight after rescaling for left-out components. */
  appliedWeight: number;
  /** 0 to 100. */
  raw: number;
  /** Points this component adds to the score. */
  points: number;
  detail: string;
}

export type RiskResult =
  | {
      scored: true;
      score: number;
      components: RiskComponent[];
      leftOut: { key: RiskComponentKey; label: string; reason: string }[];
    }
  | { scored: false; reasons: string[] };

/** Falls linearly from 100 at `full` or below, to 0 at `zero` or above. */
const linear = (value: number, full: number, zero: number) => {
  if (value <= full) return 100;
  if (value >= zero) return 0;
  return ((zero - value) / (zero - full)) * 100;
};

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

function scoreOne(
  lease: Lease,
  concentration: Concentration,
  property: Property,
  asOf: string,
  weights: RiskWeights,
): RiskResult {
  if (lease.status === 'vacant') return { scored: false, reasons: ['Vacant suite: no lease to score.'] };
  const reasons: string[] = [];
  if (!lease.expirationDate && !lease.isMonthToMonth) reasons.push('No expiration date recorded.');
  if (lease.annualRentCents === null) reasons.push('No rent recorded, so concentration is unknown.');
  const key = tenantKey(lease);
  if (!key) reasons.push('No tenant name recorded, so concentration is unknown.');
  const share = concentration.tenants.find((t) => t.key === key)?.share;
  if (reasons.length === 0 && share === undefined) reasons.push('Concentration could not be computed.');
  if (reasons.length > 0) return { scored: false, reasons };

  const candidates: { key: RiskComponentKey; raw: number; detail: string }[] = [];
  const leftOut: { key: RiskComponentKey; label: string; reason: string }[] = [];

  const months = remainingYears(lease, asOf)! * 12;
  const untilExpiry = lease.expirationDate ? daysBetween(asOf, lease.expirationDate) : 0;
  candidates.push({
    key: 'time_to_expiry',
    raw: linear(months, 12, 60),
    detail: lease.isMonthToMonth
      ? 'Month-to-month'
      : untilExpiry < 0
        ? `Expired ${days(-untilExpiry)} ago`
        : `${months.toFixed(1)} months remaining`,
  });

  const notice = noticeDate(lease);
  if (notice) {
    const away = daysBetween(asOf, notice);
    candidates.push({
      key: 'notice_urgency',
      raw: linear(away, 90, 365),
      detail: away < 0 ? `Notice date passed ${days(-away)} ago` : `Notice due in ${days(away)}`,
    });
  } else {
    leftOut.push({
      key: 'notice_urgency',
      label: LABELS.notice_urgency,
      reason: lease.isMonthToMonth ? 'Month-to-month: no notice date.' : 'No valid notice term recorded.',
    });
  }

  const uncounted = concentration.leasesMissingRent;
  candidates.push({
    key: 'concentration',
    raw: Math.min(100, (share! / CONCENTRATION_CEILING) * 100),
    detail:
      `${(share! * 100).toFixed(1)}% of in-place rent` +
      (uncounted > 0
        ? `; ${uncounted} lease${uncounted === 1 ? '' : 's'} with no rent recorded not counted`
        : ''),
  });

  const mismatch = expiresBeforeLoanMaturity(lease, property);
  if (mismatch === null) {
    leftOut.push({ key: 'loan_mismatch', label: LABELS.loan_mismatch, reason: 'No loan maturity recorded.' });
  } else {
    candidates.push({
      key: 'loan_mismatch',
      raw: mismatch ? 100 : 0,
      detail: lease.isMonthToMonth
        ? `Month-to-month: no committed term past the ${property.loanMaturityDate} maturity`
        : mismatch
          ? `Expires before the ${property.loanMaturityDate} maturity`
          : 'Runs past loan maturity',
    });
  }

  const totalWeight = candidates.reduce((n, c) => n + weights[c.key], 0);
  if (totalWeight <= 0) return { scored: false, reasons: ['Every available component has zero weight.'] };

  const components = candidates.map((c): RiskComponent => {
    const appliedWeight = (weights[c.key] / totalWeight) * 100;
    return {
      key: c.key,
      label: LABELS[c.key],
      weight: weights[c.key],
      appliedWeight,
      raw: c.raw,
      points: (c.raw * appliedWeight) / 100,
      detail: c.detail,
    };
  });
  return { scored: true, score: components.reduce((n, c) => n + c.points, 0), components, leftOut };
}

function assertWeights(weights: RiskWeights) {
  const problem = validateRiskWeights(weights);
  if (problem) throw new RangeError(problem);
}

/**
 * Time to expiry and concentration are required; without them the lease is not scored, never given a
 * default. A missing notice term or loan maturity leaves that one component out, and the remaining
 * weights are rescaled so the result still spans 0 to 100.
 */
export function scoreLeaseRisk(
  lease: Lease,
  allLeases: Lease[],
  property: Property,
  asOf: string,
  weights: RiskWeights = DEFAULT_RISK_WEIGHTS,
): RiskResult {
  assertWeights(weights);
  return scoreOne(lease, tenantConcentration(allLeases), property, asOf, weights);
}

/** Scores a whole rent roll, computing concentration once. */
export function scoreRentRoll(
  leases: Lease[],
  property: Property,
  asOf: string,
  weights: RiskWeights = DEFAULT_RISK_WEIGHTS,
): RiskResult[] {
  assertWeights(weights);
  const concentration = tenantConcentration(leases);
  return leases.map((lease) => scoreOne(lease, concentration, property, asOf, weights));
}
