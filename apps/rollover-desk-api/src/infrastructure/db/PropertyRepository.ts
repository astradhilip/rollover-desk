import type { Kysely, Selectable } from 'kysely';
import { randomUUID } from 'node:crypto';
import type { Property } from '../../domain/entities/Lease';
import type { RiskWeights } from '../../domain/entities/risk';
import type { IPropertyRepository, NewProperty } from '../../domain/ports/IPropertyRepository';
import type { Database } from './schema';

export class PropertyRepository implements IPropertyRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async list(organizationId: string): Promise<Property[]> {
    const rows = await this.db
      .selectFrom('properties')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('name')
      .orderBy('id')
      .execute();
    return rows.map(toProperty);
  }

  async findById(organizationId: string, id: string): Promise<Property | null> {
    const row = await this.db
      .selectFrom('properties')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toProperty(row) : null;
  }

  async create(organizationId: string, property: NewProperty): Promise<Property> {
    const id = randomUUID();
    await this.db
      .insertInto('properties')
      .values({
        id,
        organization_id: organizationId,
        name: property.name,
        loan_maturity_date: property.loanMaturityDate,
        market_rent_psf_cents: property.marketRentPsfCents,
        risk_weights_json: null,
      })
      .execute();
    return { id, ...property };
  }

  async riskWeights(organizationId: string, id: string): Promise<RiskWeights | null> {
    const row = await this.db
      .selectFrom('properties')
      .select('risk_weights_json')
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row?.risk_weights_json ? (JSON.parse(row.risk_weights_json) as RiskWeights) : null;
  }

  async setRiskWeights(organizationId: string, id: string, weights: RiskWeights): Promise<boolean> {
    const result = await this.db
      .updateTable('properties')
      .set({ risk_weights_json: JSON.stringify(weights) })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }
}

function toProperty(row: Selectable<Database['properties']>): Property {
  return {
    id: row.id,
    name: row.name,
    loanMaturityDate: row.loan_maturity_date,
    marketRentPsfCents: row.market_rent_psf_cents,
  };
}
