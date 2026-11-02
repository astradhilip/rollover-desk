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
};

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
