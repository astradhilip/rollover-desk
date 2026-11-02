import type { Insertable, Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/infrastructure/db/connection';
import { migrateToLatest } from '../../src/infrastructure/db/migrations';
import { PropertyRepository } from '../../src/infrastructure/db/PropertyRepository';
import type { Database } from '../../src/infrastructure/db/schema';
import { RentRollRepository } from '../../src/infrastructure/db/RentRollRepository';
import { UserRepository } from '../../src/infrastructure/db/UserRepository';
import { AttentionRepository, RenewalRepository } from '../../src/infrastructure/db/WorkflowRepositories';

const NO_FINDINGS = { issues: [], skippedRows: [] };

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

  it('stores leases with large rents exactly, scoped to their organization, and reverts', async () => {
    const properties = new PropertyRepository(db);
    const rolls = new RentRollRepository(db);
    const property = await properties.create(orgA, {
      name: 'Big',
      loanMaturityDate: null,
      marketRentPsfCents: null,
    });
    const input = {
      propertyId: property.id,
      filename: 'a.csv',
      asOf: '2026-01-15',
      createdBy: orgA,
      sheetNotes: [],
      rows: [['é', 1, { date: '2029-01-31' }, null]],
    };
    const imported = await rolls.createImport(orgA, input);
    expect(imported.rows).toEqual(input.rows);
    expect(await rolls.findImport(orgB, property.id, imported.id)).toBeNull();
    const lease = {
      id: 'x',
      sourceRow: 2,
      suite: '100',
      tenantName: 'Acme',
      status: 'occupied' as const,
      areaSf: 1000.5,
      annualRentCents: 5_000_000_000,
      commencementDate: null,
      expirationDate: '2029-01-31',
      isMonthToMonth: false,
      noticeMonths: 12,
      rentSteps: [{ date: '2027-01-01', annualRentCents: 5_100_000_000 }],
    };
    const findings = {
      issues: [{ code: 'no_notice', severity: 'warning' as const, message: 'No notice column.' }],
      skippedRows: [{ row: 9, reason: 'subtotal' as const, text: 'Total' }],
    };
    expect(await rolls.confirmedFindings(orgA, property.id, imported.id)).toBeNull();
    expect(await rolls.confirm(orgB, property.id, imported.id, [lease], findings)).toBe(false);
    expect(await rolls.confirm(orgA, property.id, imported.id, [lease], findings)).toBe(true);
    expect(await rolls.confirm(orgA, property.id, imported.id, [lease], NO_FINDINGS)).toBe(false);
    expect(await rolls.confirmedFindings(orgA, property.id, imported.id)).toEqual(findings);
    expect(await rolls.confirmedFindings(orgB, property.id, imported.id)).toBeNull();
    const [stored] = await rolls.activeLeases(orgA, property.id);
    expect(stored).toEqual({ ...lease, id: stored!.id });
    expect(await rolls.activeLeases(orgB, property.id)).toEqual([]);
    expect(await rolls.importLeases(orgB, property.id, imported.id)).toEqual([]);
    expect(await rolls.revert(orgB, property.id, imported.id)).toBe(false);
    expect(await rolls.revert(orgA, property.id, imported.id)).toBe(true);
    expect(await rolls.activeLeases(orgA, property.id)).toEqual([]);
    // An import's own leases stay readable by id after it stops being the active one.
    expect(await rolls.importLeases(orgA, property.id, imported.id)).toEqual([stored]);
  });

  it('leaves exactly one confirmed import when confirms race', async () => {
    const properties = new PropertyRepository(db);
    const rolls = new RentRollRepository(db);
    const p = await properties.create(orgA, {
      name: 'Race',
      loanMaturityDate: null,
      marketRentPsfCents: null,
    });
    const input = {
      propertyId: p.id,
      filename: 'a.csv',
      asOf: '2026-01-15',
      createdBy: orgA,
      sheetNotes: [],
      rows: [],
    };
    const made = await Promise.all(Array.from({ length: 4 }, () => rolls.createImport(orgA, input)));
    const lease = {
      id: 'x',
      sourceRow: 2,
      suite: '100',
      tenantName: 'A',
      status: 'occupied' as const,
      areaSf: 1,
      annualRentCents: 1,
      commencementDate: null,
      expirationDate: null,
      isMonthToMonth: false,
      noticeMonths: null,
      rentSteps: [],
    };
    const results = await Promise.all(made.map((m) => rolls.confirm(orgA, p.id, m.id, [lease], NO_FINDINGS)));
    expect(results).toContain(true);
    const list = await rolls.listImports(orgA, p.id);
    expect(list.filter((i) => i.status === 'confirmed')).toHaveLength(1);
    expect(await rolls.activeLeases(orgA, p.id)).toHaveLength(1);
  });

  it('keeps attention states and renewal deals by organization, and upserts', async () => {
    const properties = new PropertyRepository(db);
    const p = await properties.create(orgA, { name: 'W', loanMaturityDate: null, marketRentPsfCents: null });
    const attention = new AttentionRepository(db);
    await attention.set(orgA, p.id, 'k', 'done', orgA);
    await attention.set(orgA, p.id, 'k', 'dismissed', orgA);
    expect((await attention.list(orgA, p.id)).get('k')).toBe('dismissed');
    expect((await attention.list(orgB, p.id)).size).toBe(0);
    expect(await attention.clear(orgB, p.id, 'k')).toBe(false);
    expect(await attention.clear(orgA, p.id, 'k')).toBe(true);
    const renewals = new RenewalRepository(db);
    const deal = { suite: '1', tenantKey: 't', stage: 'contacted' as const, vacatingReason: null, note: 'n' };
    await renewals.upsert(orgA, p.id, deal);
    await renewals.upsert(orgA, p.id, { ...deal, stage: 'proposal' });
    expect(await renewals.list(orgA, p.id)).toEqual([{ ...deal, stage: 'proposal' }]);
    expect(await renewals.list(orgB, p.id)).toEqual([]);
    expect(
      await properties.setRiskWeights(orgB, p.id, {
        time_to_expiry: 100,
        notice_urgency: 0,
        concentration: 0,
        loan_mismatch: 0,
      }),
    ).toBe(false);
    expect(await properties.riskWeights(orgA, p.id)).toBeNull();
  });

  it('rejects duplicate emails, unknown roles and orphan rows', async () => {
    const insert = (over: Partial<Insertable<Database['users']>>) =>
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
