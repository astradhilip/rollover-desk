import { type AttentionItem, attentionQueue } from '../../domain/entities/attention';
import { renewalVsReplacement, type SideRates } from '../../domain/entities/commission';
import { criticalDates } from '../../domain/entities/criticalDates';
import { NotFoundError, ValidationError } from '../../domain/entities/errors';
import {
  expiresBeforeLoanMaturity,
  markToMarketPct,
  noticeDate,
  type Property,
  remainingYears,
} from '../../domain/entities/Lease';
import {
  dealFor,
  type PipelineEntry,
  type RenewalDeal,
  type RenewalStage,
  renewalPipeline,
  validateMove,
} from '../../domain/entities/renewal';
import type { ParsedLease } from '../../domain/entities/rentRollIntake';
import {
  DEFAULT_RISK_WEIGHTS,
  type RiskResult,
  type RiskWeights,
  scoreRentRoll,
  validateRiskWeights,
} from '../../domain/entities/risk';
import {
  largestTenantMismatch,
  rolloverSchedule,
  tenantConcentration,
  tenantKey,
  walt,
} from '../../domain/entities/rollover';
import type { Principal } from '../../domain/entities/User';
import type { AttentionStatus, IAttentionRepository } from '../../domain/ports/IAttentionRepository';
import type { IClock } from '../../domain/ports/IClock';
import type { IPropertyRepository } from '../../domain/ports/IPropertyRepository';
import type { IRenewalRepository } from '../../domain/ports/IRenewalRepository';
import type { IRentRollRepository } from '../../domain/ports/IRentRollRepository';

export interface PortfolioPorts {
  properties: IPropertyRepository;
  rentRolls: IRentRollRepository;
  attention: IAttentionRepository;
  renewals: IRenewalRepository;
  clock: IClock;
}

interface Loaded {
  property: Property;
  leases: ParsedLease[];
  asOf: string;
  weights: RiskWeights;
  risks: Map<string, RiskResult>;
}

/** The queries behind the dashboard. Each is scoped to the caller's organization before anything is read. */
export class Portfolio {
  constructor(private readonly ports: PortfolioPorts) {}

  private async load(principal: Principal, propertyId: string): Promise<Loaded> {
    const org = principal.organizationId;
    const property = await this.ports.properties.findById(org, propertyId);
    if (!property) throw new NotFoundError('Property');
    const leases = await this.ports.rentRolls.activeLeases(org, propertyId);
    const weights = (await this.ports.properties.riskWeights(org, propertyId)) ?? DEFAULT_RISK_WEIGHTS;
    const asOf = this.ports.clock.today();
    const scores = scoreRentRoll(leases, property, asOf, weights);
    return { property, leases, asOf, weights, risks: new Map(leases.map((l, i) => [l.id, scores[i]!])) };
  }

  async rollover(principal: Principal, propertyId: string) {
    const { property, leases, asOf, weights } = await this.load(principal, propertyId);
    const deals = await this.ports.renewals.list(principal.organizationId, propertyId);
    const vacating = leases.filter((l) => l.status === 'occupied' && dealFor(l, deals)?.stage === 'vacating');
    return {
      asOf,
      weights,
      walt: walt(leases, asOf),
      schedule: rolloverSchedule(leases, asOf),
      concentration: tenantConcentration(leases),
      largestTenant: largestTenantMismatch(leases, property),
      projectedVacating: {
        leases: vacating.length,
        areaSf: vacating.reduce((n, l) => n + (l.areaSf ?? 0), 0),
        annualRentCents: vacating.reduce((n, l) => n + (l.annualRentCents ?? 0), 0),
        leasesMissingArea: vacating.filter((l) => l.areaSf === null).length,
        leasesMissingRent: vacating.filter((l) => l.annualRentCents === null).length,
      },
    };
  }

  private view(lease: ParsedLease, loaded: Loaded) {
    const { property, asOf, risks } = loaded;
    return {
      ...lease,
      remainingYears: remainingYears(lease, asOf),
      noticeDate: noticeDate(lease),
      expiresBeforeLoanMaturity: expiresBeforeLoanMaturity(lease, property),
      markToMarketPct: markToMarketPct(lease, property.marketRentPsfCents),
      risk: risks.get(lease.id)!,
    };
  }

  async leases(principal: Principal, propertyId: string) {
    const loaded = await this.load(principal, propertyId);
    return loaded.leases.map((l) => this.view(l, loaded));
  }

  async lease(principal: Principal, propertyId: string, leaseId: string) {
    const loaded = await this.load(principal, propertyId);
    const lease = loaded.leases.find((l) => l.id === leaseId);
    if (!lease) throw new NotFoundError('Lease');
    const deals = await this.ports.renewals.list(principal.organizationId, propertyId);
    return {
      ...this.view(lease, loaded),
      asOf: loaded.asOf,
      criticalDates: criticalDates(lease, loaded.property, loaded.asOf),
      deal: dealFor(lease, deals),
    };
  }

  async commission(
    principal: Principal,
    propertyId: string,
    leaseId: string,
    termYears: number,
    rates: { renewal: SideRates; replacement: SideRates },
  ) {
    const loaded = await this.load(principal, propertyId);
    const lease = loaded.leases.find((l) => l.id === leaseId);
    if (!lease) throw new NotFoundError('Lease');
    // Missing rent is reported, never estimated as zero.
    if (lease.annualRentCents === null) return { estimate: null, reason: 'No rent recorded for this lease.' };
    return { estimate: renewalVsReplacement(lease.annualRentCents, termYears, rates), reason: null };
  }

  async criticalDates(principal: Principal, propertyId: string) {
    const { property, leases, asOf } = await this.load(principal, propertyId);
    return {
      asOf,
      leases: leases
        .filter((l) => l.status === 'occupied')
        .map((l) => ({
          leaseId: l.id,
          suite: l.suite,
          tenantName: l.tenantName,
          ...criticalDates(l, property, asOf),
        })),
    };
  }

  async attention(principal: Principal, propertyId: string) {
    const loaded = await this.load(principal, propertyId);
    const org = principal.organizationId;
    const deals = await this.ports.renewals.list(org, propertyId);
    const stages = new Map<string, RenewalStage>();
    for (const lease of loaded.leases) {
      const deal = dealFor(lease, deals);
      if (deal) stages.set(lease.id, deal.stage);
    }
    const all = attentionQueue(loaded.leases, loaded.property, loaded.asOf, loaded.risks, stages);
    const states = await this.ports.attention.list(org, propertyId);
    const items: AttentionItem[] = [];
    const handled: (AttentionItem & { status: AttentionStatus })[] = [];
    for (const item of all) {
      const status = states.get(item.key);
      if (status) handled.push({ ...item, status });
      else items.push(item);
    }
    return { asOf: loaded.asOf, items, handled };
  }

  async setAttention(principal: Principal, propertyId: string, key: string, status: AttentionStatus) {
    const { items, handled } = await this.attention(principal, propertyId);
    // Only a key in the current queue, so the table can't fill with made-up keys.
    if (![...items, ...handled].some((i) => i.key === key)) throw new NotFoundError('Attention item');
    await this.ports.attention.set(principal.organizationId, propertyId, key, status, principal.userId);
  }

  async undoAttention(principal: Principal, propertyId: string, key: string) {
    await this.load(principal, propertyId);
    if (!(await this.ports.attention.clear(principal.organizationId, propertyId, key))) {
      throw new NotFoundError('Attention item');
    }
  }

  async pipeline(principal: Principal, propertyId: string): Promise<PipelineEntry[]> {
    const { leases, asOf } = await this.load(principal, propertyId);
    const deals = await this.ports.renewals.list(principal.organizationId, propertyId);
    return renewalPipeline(leases, deals, asOf);
  }

  /** Each move stands alone and reports its own outcome, so one bad suite doesn't hide the others. */
  async moveRenewals(
    principal: Principal,
    propertyId: string,
    moves: { suite: string; stage: RenewalStage; vacatingReason?: string | null; note?: string | null }[],
  ) {
    const { leases } = await this.load(principal, propertyId);
    const org = principal.organizationId;
    let deals = await this.ports.renewals.list(org, propertyId);
    const results: { suite: string; ok: boolean; error: string | null }[] = [];
    for (const move of moves) {
      const lease = leases.find((l) => l.suite === move.suite);
      const reason = move.vacatingReason ?? null;
      const problem = validateMove(lease, move.stage, reason);
      if (problem) {
        results.push({ suite: move.suite, ok: false, error: problem });
        continue;
      }
      const existing = dealFor(lease!, deals);
      const deal: RenewalDeal = {
        suite: move.suite,
        tenantKey: tenantKey(lease!)!,
        stage: move.stage,
        // A reason only stands while vacating. Leaving a note out keeps it; sending null clears it.
        vacatingReason: move.stage === 'vacating' ? reason : null,
        note: move.note === undefined ? (existing?.note ?? null) : move.note,
      };
      await this.ports.renewals.upsert(org, propertyId, deal);
      // Later moves in this batch must see this one.
      deals = [...deals.filter((d) => d !== existing), deal];
      results.push({ suite: move.suite, ok: true, error: null });
    }
    return results;
  }

  async setRiskWeights(principal: Principal, propertyId: string, weights: RiskWeights): Promise<RiskWeights> {
    const problem = validateRiskWeights(weights as unknown as Record<string, unknown>);
    if (problem) throw new ValidationError(problem);
    if (!(await this.ports.properties.setRiskWeights(principal.organizationId, propertyId, weights))) {
      throw new NotFoundError('Property');
    }
    return weights;
  }
}
