import { type Kysely, sql } from 'kysely';
import { type Migration, Migrator } from 'kysely/migration';
import type { Database } from './schema';

/** Portable schema only: text ids, ISO date strings, integer money, nothing specific to one database. */
const migrations: Record<string, Migration> = {
  '0001_organizations_users_properties': {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable('organizations')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('name', 'text', (c) => c.notNull())
        .execute();
      await db.schema
        .createTable('users')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('organization_id', 'text', (c) => c.notNull().references('organizations.id'))
        .addColumn('email', 'text', (c) => c.notNull().unique())
        .addColumn('password_hash', 'text', (c) => c.notNull())
        .addColumn('role', 'text', (c) => c.notNull().check(sql`role in ('analyst', 'viewer')`))
        .execute();
      await db.schema
        .createTable('properties')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('organization_id', 'text', (c) => c.notNull().references('organizations.id'))
        .addColumn('name', 'text', (c) => c.notNull())
        .addColumn('loan_maturity_date', 'text')
        .addColumn('market_rent_psf_cents', 'integer')
        .addColumn('created_at', 'text', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
        .execute();
      await db.schema
        .createIndex('properties_organization')
        .on('properties')
        .column('organization_id')
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable('properties').execute();
      await db.schema.dropTable('users').execute();
      await db.schema.dropTable('organizations').execute();
    },
  },
  '0002_rent_rolls_attention_renewals': {
    async up(db: Kysely<unknown>) {
      await db.schema.alterTable('properties').addColumn('risk_weights_json', 'text').execute();
      await db.schema
        .createTable('rent_roll_imports')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('organization_id', 'text', (c) => c.notNull().references('organizations.id'))
        .addColumn('property_id', 'text', (c) => c.notNull().references('properties.id'))
        .addColumn('filename', 'text', (c) => c.notNull())
        .addColumn('status', 'text', (c) => c.notNull())
        .addColumn('as_of', 'text', (c) => c.notNull())
        .addColumn('created_by', 'text', (c) => c.notNull().references('users.id'))
        .addColumn('created_at', 'text', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
        .addColumn('sheet_notes_json', 'text', (c) => c.notNull())
        .addColumn('overrides_json', 'text', (c) => c.notNull())
        .addColumn('rows_json', 'text', (c) => c.notNull())
        .addColumn('confirmed_seq', 'integer')
        .execute();
      await db.schema
        .createIndex('imports_property')
        .on('rent_roll_imports')
        .columns(['organization_id', 'property_id'])
        .execute();
      // At most one current rent roll per property, even when two analysts confirm at once.
      await db.schema
        .createIndex('imports_one_confirmed')
        .unique()
        .on('rent_roll_imports')
        .columns(['organization_id', 'property_id'])
        .where(sql.ref('status'), '=', sql.lit('confirmed'))
        .execute();
      await db.schema
        .createTable('leases')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('organization_id', 'text', (c) => c.notNull().references('organizations.id'))
        .addColumn('property_id', 'text', (c) => c.notNull().references('properties.id'))
        .addColumn('import_id', 'text', (c) => c.notNull().references('rent_roll_imports.id'))
        .addColumn('source_row', 'integer', (c) => c.notNull())
        .addColumn('suite', 'text', (c) => c.notNull())
        .addColumn('tenant_name', 'text')
        .addColumn('status', 'text', (c) => c.notNull())
        .addColumn('area_sf', 'double precision')
        // bigint: integer tops out near $21M a year in cents.
        .addColumn('annual_rent_cents', 'bigint')
        .addColumn('commencement_date', 'text')
        .addColumn('expiration_date', 'text')
        .addColumn('is_month_to_month', 'integer', (c) => c.notNull())
        .addColumn('notice_months', 'integer')
        .addColumn('rent_steps_json', 'text', (c) => c.notNull())
        .execute();
      await db.schema
        .createIndex('leases_import')
        .on('leases')
        .columns(['organization_id', 'import_id'])
        .execute();
      await db.schema
        .createTable('attention_states')
        .addColumn('organization_id', 'text', (c) => c.notNull().references('organizations.id'))
        .addColumn('property_id', 'text', (c) => c.notNull().references('properties.id'))
        .addColumn('item_key', 'text', (c) => c.notNull())
        .addColumn('status', 'text', (c) => c.notNull())
        .addColumn('updated_by', 'text', (c) => c.notNull().references('users.id'))
        .addPrimaryKeyConstraint('attention_states_pk', ['organization_id', 'property_id', 'item_key'])
        .execute();
      await db.schema
        .createTable('renewal_deals')
        .addColumn('organization_id', 'text', (c) => c.notNull().references('organizations.id'))
        .addColumn('property_id', 'text', (c) => c.notNull().references('properties.id'))
        .addColumn('suite', 'text', (c) => c.notNull())
        .addColumn('tenant_key', 'text', (c) => c.notNull())
        .addColumn('stage', 'text', (c) => c.notNull())
        .addColumn('vacating_reason', 'text')
        .addColumn('note', 'text')
        .addPrimaryKeyConstraint('renewal_deals_pk', [
          'organization_id',
          'property_id',
          'suite',
          'tenant_key',
        ])
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable('renewal_deals').execute();
      await db.schema.dropTable('attention_states').execute();
      await db.schema.dropTable('leases').execute();
      await db.schema.dropTable('rent_roll_imports').execute();
      await db.schema.alterTable('properties').dropColumn('risk_weights_json').execute();
    },
  },
  '0003_session_versions_confirmed_issues': {
    async up(db: Kysely<unknown>) {
      // Tokens carry this; moving it on ends every session the user has.
      await db.schema
        .alterTable('users')
        .addColumn('session_version', 'integer', (c) => c.notNull().defaultTo(0))
        .execute();
      // What the analyst saw and acknowledged when confirming, kept as the record the export shows.
      await db.schema.alterTable('rent_roll_imports').addColumn('confirmed_issues_json', 'text').execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.alterTable('rent_roll_imports').dropColumn('confirmed_issues_json').execute();
      await db.schema.alterTable('users').dropColumn('session_version').execute();
    },
  },
};

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
