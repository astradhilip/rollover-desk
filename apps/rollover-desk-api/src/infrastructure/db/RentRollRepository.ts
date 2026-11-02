import type { Kysely, Selectable } from 'kysely';
import { randomUUID } from 'node:crypto';
import type { ParsedLease } from '../../domain/entities/rentRollIntake';
import type { IRentRollRepository, NewImport, RentRollImport } from '../../domain/ports/IRentRollRepository';
import type { Database } from './schema';

type ImportRow = Selectable<Database['rent_roll_imports']>;

const INSERT_BATCH = 100;

/** Rolls the transaction back when a parallel confirm took this import after the status check. */
class ImportNoLongerPending extends Error {}

function isUniqueViolation(error: unknown): boolean {
  if (error instanceof ImportNoLongerPending) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE';
}

export class RentRollRepository implements IRentRollRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createImport(organizationId: string, input: NewImport): Promise<RentRollImport> {
    const id = randomUUID();
    await this.db
      .insertInto('rent_roll_imports')
      .values({
        id,
        organization_id: organizationId,
        property_id: input.propertyId,
        filename: input.filename,
        status: 'pending',
        as_of: input.asOf,
        created_by: input.createdBy,
        sheet_notes_json: JSON.stringify(input.sheetNotes),
        overrides_json: '{}',
        rows_json: JSON.stringify(input.rows),
        confirmed_seq: null,
      })
      .execute();
    return (await this.findImport(organizationId, input.propertyId, id))!;
  }

  async findImport(organizationId: string, propertyId: string, id: string): Promise<RentRollImport | null> {
    const row = await this.db
      .selectFrom('rent_roll_imports')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('property_id', '=', propertyId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? { ...toSummary(row), rows: JSON.parse(row.rows_json) as RentRollImport['rows'] } : null;
  }

  async listImports(organizationId: string, propertyId: string) {
    const rows = await this.db
      .selectFrom('rent_roll_imports')
      // Not rows_json: a list has no use for every uploaded grid.
      .select([
        'id',
        'property_id',
        'filename',
        'status',
        'as_of',
        'created_by',
        'created_at',
        'sheet_notes_json',
        'overrides_json',
      ])
      .where('organization_id', '=', organizationId)
      .where('property_id', '=', propertyId)
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .execute();
    return rows.map(toSummary);
  }

  async setOverrides(
    organizationId: string,
    propertyId: string,
    id: string,
    overrides: RentRollImport['overrides'],
  ) {
    const result = await this.db
      .updateTable('rent_roll_imports')
      .set({ overrides_json: JSON.stringify(overrides) })
      .where('organization_id', '=', organizationId)
      .where('property_id', '=', propertyId)
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async confirm(
    organizationId: string,
    propertyId: string,
    id: string,
    leases: ParsedLease[],
  ): Promise<boolean> {
    try {
      return await this.confirmInTransaction(organizationId, propertyId, id, leases);
    } catch (error) {
      // Another confirm won the race for this property; its rent roll stands.
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  private confirmInTransaction(
    organizationId: string,
    propertyId: string,
    id: string,
    leases: ParsedLease[],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const scope = () =>
        trx
          .updateTable('rent_roll_imports')
          .where('organization_id', '=', organizationId)
          .where('property_id', '=', propertyId);
      const target = await trx
        .selectFrom('rent_roll_imports')
        .select('status')
        .where('organization_id', '=', organizationId)
        .where('property_id', '=', propertyId)
        .where('id', '=', id)
        .executeTakeFirst();
      if (target?.status !== 'pending') return false;
      const last = await trx
        .selectFrom('rent_roll_imports')
        .select((eb) => eb.fn.max('confirmed_seq').as('seq'))
        .where('organization_id', '=', organizationId)
        .where('property_id', '=', propertyId)
        .executeTakeFirst();
      // Retire the current one first: the unique index allows only one confirmed at any moment.
      await scope().set({ status: 'replaced' }).where('status', '=', 'confirmed').execute();
      const claimed = await scope()
        .set({ status: 'confirmed', confirmed_seq: Number(last?.seq ?? 0) + 1 })
        .where('id', '=', id)
        .where('status', '=', 'pending')
        .executeTakeFirst();
      if (claimed.numUpdatedRows === 0n) throw new ImportNoLongerPending();
      for (let i = 0; i < leases.length; i += INSERT_BATCH) {
        await trx
          .insertInto('leases')
          .values(
            leases.slice(i, i + INSERT_BATCH).map((l) => ({
              id: randomUUID(),
              organization_id: organizationId,
              property_id: propertyId,
              import_id: id,
              source_row: l.sourceRow,
              suite: l.suite,
              tenant_name: l.tenantName,
              status: l.status,
              area_sf: l.areaSf,
              annual_rent_cents: l.annualRentCents,
              commencement_date: l.commencementDate,
              expiration_date: l.expirationDate,
              is_month_to_month: l.isMonthToMonth ? 1 : 0,
              notice_months: l.noticeMonths,
              rent_steps_json: JSON.stringify(l.rentSteps),
            })),
          )
          .execute();
      }
      return true;
    });
  }

  revert(organizationId: string, propertyId: string, id: string): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const scope = () =>
        trx
          .updateTable('rent_roll_imports')
          .where('organization_id', '=', organizationId)
          .where('property_id', '=', propertyId);
      const retired = await scope()
        .set({ status: 'reverted' })
        .where('id', '=', id)
        .where('status', '=', 'confirmed')
        .executeTakeFirst();
      if (retired.numUpdatedRows === 0n) return false;
      const previous = await trx
        .selectFrom('rent_roll_imports')
        .select('id')
        .where('organization_id', '=', organizationId)
        .where('property_id', '=', propertyId)
        .where('status', '=', 'replaced')
        .orderBy('confirmed_seq', 'desc')
        .executeTakeFirst();
      if (previous) await scope().set({ status: 'confirmed' }).where('id', '=', previous.id).execute();
      return true;
    });
  }

  async activeLeases(organizationId: string, propertyId: string): Promise<ParsedLease[]> {
    const rows = await this.db
      .selectFrom('leases')
      .innerJoin('rent_roll_imports', 'rent_roll_imports.id', 'leases.import_id')
      .selectAll('leases')
      .where('leases.organization_id', '=', organizationId)
      .where('leases.property_id', '=', propertyId)
      .where('rent_roll_imports.organization_id', '=', organizationId)
      .where('rent_roll_imports.status', '=', 'confirmed')
      .orderBy('leases.source_row')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      sourceRow: r.source_row,
      suite: r.suite,
      tenantName: r.tenant_name,
      status: r.status,
      areaSf: r.area_sf,
      // PostgreSQL returns bigint as text.
      annualRentCents: r.annual_rent_cents === null ? null : Number(r.annual_rent_cents),
      commencementDate: r.commencement_date,
      expirationDate: r.expiration_date,
      isMonthToMonth: r.is_month_to_month === 1,
      noticeMonths: r.notice_months,
      rentSteps: JSON.parse(r.rent_steps_json) as ParsedLease['rentSteps'],
    }));
  }
}

function toSummary(
  row: Omit<ImportRow, 'rows_json' | 'organization_id' | 'confirmed_seq'>,
): Omit<RentRollImport, 'rows'> {
  return {
    id: row.id,
    propertyId: row.property_id,
    filename: row.filename,
    status: row.status,
    asOf: row.as_of,
    createdBy: row.created_by,
    createdAt: row.created_at,
    sheetNotes: JSON.parse(row.sheet_notes_json) as string[],
    overrides: JSON.parse(row.overrides_json) as RentRollImport['overrides'],
  };
}
