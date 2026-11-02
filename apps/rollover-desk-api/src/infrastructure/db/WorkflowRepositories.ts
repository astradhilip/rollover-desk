import type { Kysely } from 'kysely';
import type { RenewalDeal, RenewalStage } from '../../domain/entities/renewal';
import type { AttentionStatus, IAttentionRepository } from '../../domain/ports/IAttentionRepository';
import type { IRenewalRepository } from '../../domain/ports/IRenewalRepository';
import type { Database } from './schema';

export class AttentionRepository implements IAttentionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async list(organizationId: string, propertyId: string) {
    const rows = await this.db
      .selectFrom('attention_states')
      .select(['item_key', 'status'])
      .where('organization_id', '=', organizationId)
      .where('property_id', '=', propertyId)
      .execute();
    return new Map(rows.map((r) => [r.item_key, r.status]));
  }

  async set(
    organizationId: string,
    propertyId: string,
    key: string,
    status: AttentionStatus,
    userId: string,
  ) {
    await this.db
      .insertInto('attention_states')
      .values({
        organization_id: organizationId,
        property_id: propertyId,
        item_key: key,
        status,
        updated_by: userId,
      })
      .onConflict((c) =>
        c.columns(['organization_id', 'property_id', 'item_key']).doUpdateSet({ status, updated_by: userId }),
      )
      .execute();
  }

  async clear(organizationId: string, propertyId: string, key: string) {
    const result = await this.db
      .deleteFrom('attention_states')
      .where('organization_id', '=', organizationId)
      .where('property_id', '=', propertyId)
      .where('item_key', '=', key)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}

export class RenewalRepository implements IRenewalRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async list(organizationId: string, propertyId: string): Promise<RenewalDeal[]> {
    const rows = await this.db
      .selectFrom('renewal_deals')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('property_id', '=', propertyId)
      .execute();
    return rows.map((r) => ({
      suite: r.suite,
      tenantKey: r.tenant_key,
      stage: r.stage as RenewalStage,
      vacatingReason: r.vacating_reason,
      note: r.note,
    }));
  }

  async upsert(organizationId: string, propertyId: string, deal: RenewalDeal) {
    const fields = { stage: deal.stage, vacating_reason: deal.vacatingReason, note: deal.note };
    await this.db
      .insertInto('renewal_deals')
      .values({
        organization_id: organizationId,
        property_id: propertyId,
        suite: deal.suite,
        tenant_key: deal.tenantKey,
        ...fields,
      })
      .onConflict((c) =>
        c.columns(['organization_id', 'property_id', 'suite', 'tenant_key']).doUpdateSet(fields),
      )
      .execute();
  }
}
