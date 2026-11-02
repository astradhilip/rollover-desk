import type { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/infrastructure/db/connection';
import { migrateToLatest } from '../../src/infrastructure/db/migrations';
import { PropertyRepository } from '../../src/infrastructure/db/PropertyRepository';
import type { Database } from '../../src/infrastructure/db/schema';
import { UserRepository } from '../../src/infrastructure/db/UserRepository';

const targets = [
  { name: 'SQLite', url: ':memory:' },
  ...(process.env.TEST_POSTGRES_URL ? [{ name: 'PostgreSQL', url: process.env.TEST_POSTGRES_URL }] : []),
];

describe.each(targets)('repositories on $name', ({ url }) => {
  let db: Kysely<Database>;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const emailA = `a-${orgA}@example.com`;

  beforeAll(async () => {
    db = createDatabase(url);
    await migrateToLatest(db);
    await db
      .insertInto('organizations')
      .values([
        { id: orgA, name: 'A' },
        { id: orgB, name: 'B' },
      ])
      .execute();
    await db
      .insertInto('users')
      .values({ id: orgA, organization_id: orgA, email: emailA, password_hash: 'h', role: 'analyst' })
      .execute();
  });
  afterAll(() => db.destroy());

  it('migrating twice is harmless', async () => {
    await migrateToLatest(db);
  });

  it('keeps properties within their organization', async () => {
    const repo = new PropertyRepository(db);
    const made = await repo.create(orgA, {
      name: 'Tower',
      loanMaturityDate: '2028-02-29',
      marketRentPsfCents: 3600,
    });
    expect(await repo.findById(orgA, made.id)).toEqual(made);
    expect(await repo.findById(orgB, made.id)).toBeNull();
    expect(await repo.list(orgB)).toEqual([]);
    expect(await repo.list(orgA)).toEqual([made]);
  });

  it('keeps nulls as nulls', async () => {
    const repo = new PropertyRepository(db);
    const made = await repo.create(orgB, { name: 'Empty', loanMaturityDate: null, marketRentPsfCents: null });
    expect(await repo.findById(orgB, made.id)).toEqual(made);
  });

  it('finds a user by credentials and only within their organization by id', async () => {
    const repo = new UserRepository(db);
    const found = await repo.findCredentialsByEmail(emailA);
    expect(found).toMatchObject({
      passwordHash: 'h',
      user: { organizationId: orgA, organizationName: 'A', role: 'analyst' },
    });
    expect(await repo.findById(orgA, orgA)).toMatchObject({ email: emailA });
    expect(await repo.findById(orgB, orgA)).toBeNull();
    expect(await repo.findCredentialsByEmail('none@example.com')).toBeNull();
  });

  it('rejects duplicate emails, unknown roles and orphan rows', async () => {
    const insert = (over: Partial<Database['users']>) =>
      db
        .insertInto('users')
        .values({
          id: randomUUID(),
          organization_id: orgA,
          email: `${randomUUID()}@example.com`,
          password_hash: 'h',
          role: 'viewer',
          ...over,
        })
        .execute();
    await expect(insert({ email: emailA })).rejects.toThrow();
    await expect(insert({ role: 'admin' as 'viewer' })).rejects.toThrow();
    await expect(insert({ organization_id: 'missing' })).rejects.toThrow();
  });
});
