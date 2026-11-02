// Two invented organizations, so isolation can be shown live. Passwords here are demo-only.
import type { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AS_OF, PROPERTY } from '@rollover-desk/synthetic';
import { ScryptPasswordHasher } from '../security/ScryptPasswordHasher';
import { createDatabase } from './connection';
import { migrateToLatest } from './migrations';
import type { Database } from './schema';

export const DEMO_USERS = [
  {
    email: 'analyst@prairie-ridge.example',
    password: 'demo-prairie-analyst',
    role: 'analyst',
    org: 'Prairie Ridge Advisors',
  },
  {
    email: 'viewer@prairie-ridge.example',
    password: 'demo-prairie-viewer',
    role: 'viewer',
    org: 'Prairie Ridge Advisors',
  },
  {
    email: 'analyst@lone-oak.example',
    password: 'demo-lone-oak-analyst',
    role: 'analyst',
    org: 'Lone Oak Capital',
  },
] as const;

export async function seed(db: Kysely<Database>): Promise<void> {
  const already = await db.selectFrom('organizations').select('id').executeTakeFirst();
  if (already) return;
  const hasher = new ScryptPasswordHasher();
  const hashes = await Promise.all(DEMO_USERS.map((u) => hasher.hash(u.password)));
  // All or nothing, because the check above would otherwise skip a half-finished seed forever.
  await db.transaction().execute(async (trx) => {
    const orgIds = new Map<string, string>();
    for (const [i, user] of DEMO_USERS.entries()) {
      if (!orgIds.has(user.org)) {
        const id = randomUUID();
        orgIds.set(user.org, id);
        await trx.insertInto('organizations').values({ id, name: user.org }).execute();
      }
      await trx
        .insertInto('users')
        .values({
          id: randomUUID(),
          organization_id: orgIds.get(user.org)!,
          email: user.email,
          password_hash: hashes[i]!,
          role: user.role,
        })
        .execute();
    }
    await trx
      .insertInto('properties')
      .values({
        id: randomUUID(),
        organization_id: orgIds.get('Prairie Ridge Advisors')!,
        name: PROPERTY.name,
        loan_maturity_date: PROPERTY.loanMaturityDate,
        market_rent_psf_cents: PROPERTY.marketRentPsfCents,
        risk_weights_json: null,
      })
      .execute();
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo users are not for production.');
  const db = createDatabase(process.env.DATABASE_URL);
  await migrateToLatest(db);
  await seed(db);
  await db.destroy();
  console.log(`Seeded demo data. Sample rent rolls are dated ${AS_OF}.`);
}
