import { answerKeyTotals, generateSamples, type SampleFile } from '@rollover-desk/synthetic';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '../../src/infrastructure/db/seed';
import { buildTestApp } from './harness';

const [ANALYST, VIEWER, OTHER] = DEMO_USERS;
let ctx: Awaited<ReturnType<typeof buildTestApp>>;
let files: SampleFile[];
let totals: ReturnType<typeof answerKeyTotals>;
let auth: Record<string, { Authorization: string }>;
let pid: string;

const file = (prefix: string) => files.find((f) => f.filename.startsWith(prefix))!;
const upload = (f: SampleFile, who = ANALYST.email, property = pid) =>
  request(ctx.app)
    .post(`/properties/${property}/imports`)
    .set(auth[who]!)
    .attach('file', f.bytes, f.filename);
const get = (path: string, who: string = VIEWER.email) =>
  request(ctx.app).get(`/properties/${pid}${path}`).set(auth[who]!);
const confirm = (id: string, acknowledgeWarnings = true) =>
  request(ctx.app)
    .post(`/properties/${pid}/imports/${id}/confirm`)
    .set(auth[ANALYST.email]!)
    .send({ acknowledgeWarnings });
async function loadClean() {
  const { body } = await upload(file('clean')).expect(201);
  await confirm(body.import.id).expect(200);
  return body.import.id as string;
}

beforeEach(async () => {
  ctx = await buildTestApp();
  const generated = await generateSamples();
  files = generated.files;
  totals = answerKeyTotals(generated.key);
  auth = {};
  for (const u of DEMO_USERS) {
    const { body } = await request(ctx.app)
      .post('/auth/login')
      .send({ email: u.email, password: u.password })
      .expect(200);
    auth[u.email] = { Authorization: `Bearer ${body.token}` };
  }
  const list = await request(ctx.app).get('/properties').set(auth[ANALYST.email]!);
  pid = list.body.properties[0].id;
});

describe('upload, review, confirm', () => {
  it('holds an upload as pending: nothing is live until confirmed', async () => {
    const { body } = await upload(file('clean')).expect(201);
    expect(body.import.status).toBe('pending');
    expect(body.review.canConfirm).toBe(true);
    expect((await get('/leases')).body.leases).toEqual([]);
    await confirm(body.import.id).expect(200);
    const live = (await get('/leases')).body.leases;
    expect(live).toHaveLength(body.review.leases.length);
  });

  it('reproduces the answer key through upload, storage and the rollover route', async () => {
    await loadClean();
    const { body } = await get('/rollover').expect(200);
    expect(body.schedule.totals).toEqual({
      leases: totals.occupiedLeases,
      areaSf: totals.leasedAreaSf,
      annualRentCents: totals.annualRentCents,
    });
    expect(body.schedule.mtmOrExpired.leases).toBeGreaterThanOrEqual(totals.monthToMonth);
    expect(body.walt.byArea.years).toBeGreaterThan(0);
  });

  it('refuses to confirm with blocking issues, and reports them', async () => {
    const { body } = await upload(file('property-manager')).expect(201);
    expect(body.review.canConfirm).toBe(false);
    expect(body.review.issues.some((i: { code: string }) => i.code === 'duplicate_suite')).toBe(true);
    const res = await confirm(body.import.id).expect(409);
    expect(res.body.error.code).toBe('conflict');
    expect((await get('/leases')).body.leases).toEqual([]);
  });

  it('requires warnings to be acknowledged', async () => {
    const csv = Buffer.from('Suite,Tenant,SF,Annual Rent,Expiration\n100,Acme,1000,30000,1/1/2030\n');
    const { body } = await request(ctx.app)
      .post(`/properties/${pid}/imports`)
      .set(auth[ANALYST.email]!)
      .attach('file', csv, 'a.csv')
      .expect(201);
    expect(body.review.issues.map((i: { code: string }) => i.code)).toEqual(['no_notice_column']);
    await confirm(body.import.id, false).expect(409);
    await confirm(body.import.id, true).expect(200);
    await confirm(body.import.id, true).expect(409);
  });

  it('lets an analyst correct the mapping, then confirm', async () => {
    const csv = Buffer.from('Suite,Tenant,SF,Rent,Expiration,Notice\n100,Acme,1000,2500,1/1/2030,12\n');
    const { body } = await request(ctx.app)
      .post(`/properties/${pid}/imports`)
      .set(auth[ANALYST.email]!)
      .attach('file', csv, 'a.csv');
    expect(body.review.canConfirm).toBe(false);
    const fixed = await request(ctx.app)
      .put(`/properties/${pid}/imports/${body.import.id}/mapping`)
      .set(auth[ANALYST.email]!)
      .send({ overrides: [{ column: 3, field: 'monthlyRent' }] })
      .expect(200);
    expect(fixed.body.review.canConfirm).toBe(true);
    expect(fixed.body.review.leases[0].annualRentCents).toBe(3_000_000);
    await confirm(body.import.id).expect(200);
    expect((await get('/leases')).body.leases[0].annualRentCents).toBe(3_000_000);
    await request(ctx.app)
      .put(`/properties/${pid}/imports/${body.import.id}/mapping`)
      .set(auth[ANALYST.email]!)
      .send({ overrides: [] })
      .expect(409);
  });

  it('refuses bad uploads with the one error shape', async () => {
    const send = (bytes: Buffer, name: string) =>
      request(ctx.app)
        .post(`/properties/${pid}/imports`)
        .set(auth[ANALYST.email]!)
        .attach('file', bytes, name);
    const expectBad = async (res: request.Response) => {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    };
    await expectBad(await send(Buffer.from('x'), 'a.pdf'));
    await expectBad(await send(Buffer.from('not a zip'), 'a.xlsx'));
    await expectBad(await send(Buffer.alloc(11 * 1024 * 1024), 'a.csv'));
    await expectBad(await request(ctx.app).post(`/properties/${pid}/imports`).set(auth[ANALYST.email]!));
  });

  it('keeps spreadsheet-formula text as literal data through to the API', async () => {
    const csv = Buffer.from(
      'Suite,Tenant,SF,Annual Rent,Expiration,Notice\n100,"=HYPERLINK(""x"")",1000,30000,1/1/2030,12\n',
    );
    const { body } = await request(ctx.app)
      .post(`/properties/${pid}/imports`)
      .set(auth[ANALYST.email]!)
      .attach('file', csv, 'a.csv');
    await confirm(body.import.id).expect(200);
    expect((await get('/leases')).body.leases[0].tenantName).toBe('=HYPERLINK("x")');
  });
});

describe('history and revert', () => {
  const csv = (rent: number) =>
    Buffer.from(`Suite,Tenant,SF,Annual Rent,Expiration,Notice\n100,Acme,1000,${rent},1/1/2030,12\n`);
  const load = async (rent: number) => {
    const { body } = await request(ctx.app)
      .post(`/properties/${pid}/imports`)
      .set(auth[ANALYST.email]!)
      .attach('file', csv(rent), 'a.csv');
    await confirm(body.import.id).expect(200);
    return body.import.id as string;
  };
  const rent = async () => (await get('/leases')).body.leases[0]?.annualRentCents;
  const revert = (id: string) =>
    request(ctx.app).post(`/properties/${pid}/imports/${id}/revert`).set(auth[ANALYST.email]!);

  it('replaces on confirm and restores on revert, one step at a time', async () => {
    const first = await load(10000);
    const second = await load(20000);
    expect(await rent()).toBe(2_000_000);
    await revert(first).expect(409);
    await revert(second).expect(200);
    expect(await rent()).toBe(1_000_000);
    await revert(second).expect(409);
    await revert(first).expect(200);
    expect(await rent()).toBeUndefined();
    const { body } = await get('/imports').expect(200);
    expect(body.imports.map((i: { status: string }) => i.status).sort()).toEqual(['reverted', 'reverted']);
    expect(JSON.stringify(body)).not.toContain('Acme');
  });
});

describe('leases and explanations', () => {
  it('explains risk, reports what is unscored, and gives critical dates', async () => {
    await loadClean();
    const { body } = await get('/leases');
    const scored = body.leases.find((l: { risk: { scored: boolean } }) => l.risk.scored);
    const detail = await get(`/leases/${scored.id}`).expect(200);
    const sum = detail.body.risk.components.reduce((n: number, c: { points: number }) => n + c.points, 0);
    expect(sum).toBeCloseTo(detail.body.risk.score, 8);
    expect(
      detail.body.criticalDates.upcoming.length + detail.body.criticalDates.passed.length,
    ).toBeGreaterThan(0);
    const vacant = body.leases.find((l: { status: string }) => l.status === 'vacant');
    expect(vacant.risk.scored).toBe(false);
    const dates = await get('/critical-dates').expect(200);
    expect(dates.body.leases.length).toBe(totals.occupiedLeases);
  });

  it('applies saved risk weights, and refuses ones not totalling 100', async () => {
    await loadClean();
    const put = (body: object) =>
      request(ctx.app).put(`/properties/${pid}/risk-weights`).set(auth[ANALYST.email]!).send(body);
    await put({ time_to_expiry: 50, notice_urgency: 20, concentration: 25, loan_mismatch: 15 }).expect(400);
    await put({ time_to_expiry: 0, notice_urgency: 0, concentration: 100, loan_mismatch: 0 }).expect(200);
    const { body } = await get('/leases');
    const scored = body.leases.find((l: { risk: { scored: boolean } }) => l.risk.scored);
    const c = scored.risk.components.find((x: { key: string }) => x.key === 'concentration');
    expect(scored.risk.score).toBeCloseTo(c.raw, 8);
  });

  it('estimates commission only from supplied rates, and never on missing rent', async () => {
    const csv = Buffer.from(
      'Suite,Tenant,SF,Annual Rent,Expiration,Notice\n100,Acme,1000,100000,1/1/2030,12\n101,Blank,1000,,1/1/2030,12\n',
    );
    const { body } = await request(ctx.app)
      .post(`/properties/${pid}/imports`)
      .set(auth[ANALYST.email]!)
      .attach('file', csv, 'a.csv');
    await confirm(body.import.id).expect(200);
    const leases = (await get('/leases')).body.leases;
    const rates =
      'termYears=5&newLandlordBps=400&newTenantBps=200&renewalLandlordBps=200&renewalTenantBps=100';
    await get(`/leases/${leases[0].id}/commission?termYears=5`).expect(400);
    const ok = await get(`/leases/${leases[0].id}/commission?${rates}`).expect(200);
    expect(ok.body.estimate.replacement.totalCommissionCents).toBe(3_000_000);
    expect(ok.body.estimate.renewal.totalCommissionCents).toBe(1_500_000);
    const none = await get(`/leases/${leases[1].id}/commission?${rates}`).expect(200);
    expect(none.body.estimate).toBeNull();
    expect(none.body.reason).toMatch(/No rent/);
  });
});

describe('attention', () => {
  it('marks done, moves to handled, and undoes', async () => {
    await loadClean();
    const q = (await get('/attention').expect(200)).body;
    expect(q.items.length).toBeGreaterThan(0);
    const key = q.items[0].key;
    const path = `/properties/${pid}/attention/${key}`;
    await request(ctx.app).put(path).set(auth[ANALYST.email]!).send({ status: 'done' }).expect(200);
    const after = (await get('/attention')).body;
    expect(after.items.some((i: { key: string }) => i.key === key)).toBe(false);
    expect(after.handled.find((i: { key: string }) => i.key === key).status).toBe('done');
    await request(ctx.app).delete(path).set(auth[ANALYST.email]!).expect(200);
    expect((await get('/attention')).body.items.some((i: { key: string }) => i.key === key)).toBe(true);
    await request(ctx.app).delete(path).set(auth[ANALYST.email]!).expect(404);
  });
  it('refuses a key that is not in the queue', async () => {
    await loadClean();
    await request(ctx.app)
      .put(`/properties/${pid}/attention/made-up`)
      .set(auth[ANALYST.email]!)
      .send({ status: 'done' })
      .expect(404);
  });
});

describe('renewal pipeline', () => {
  const moves = (body: object) =>
    request(ctx.app).post(`/properties/${pid}/renewals/moves`).set(auth[ANALYST.email]!).send(body);

  it('reports each move, keeps notes, and updates projected rollover when vacating', async () => {
    await loadClean();
    const entries = (await get('/renewals').expect(200)).body.entries;
    const target = entries[0].lease;
    const r = await moves({
      moves: [
        { suite: target.suite, stage: 'contacted', note: 'Called the tenant' },
        { suite: 'no-such', stage: 'contacted' },
        { suite: target.suite, stage: 'vacating' },
      ],
    }).expect(200);
    expect(r.body.results.map((x: { ok: boolean }) => x.ok)).toEqual([true, false, false]);
    expect(r.body.results[2].error).toMatch(/why/);
    await moves({ moves: [{ suite: target.suite, stage: 'vacating', vacatingReason: 'Downsizing' }] }).expect(
      200,
    );
    const entry = (await get('/renewals')).body.entries.find(
      (e: { lease: { suite: string } }) => e.lease.suite === target.suite,
    );
    expect(entry).toMatchObject({
      stage: 'vacating',
      vacatingReason: 'Downsizing',
      note: 'Called the tenant',
    });
    const roll = (await get('/rollover')).body;
    expect(roll.projectedVacating.leases).toBe(1);
    expect(roll.projectedVacating.areaSf).toBe(target.areaSf);
  });

  it('keeps the deal across a re-import of the same tenant', async () => {
    const first = await loadClean();
    const target = (await get('/renewals')).body.entries[0].lease;
    await moves({ moves: [{ suite: target.suite, stage: 'proposal' }] }).expect(200);
    await request(ctx.app)
      .post(`/properties/${pid}/imports/${first}/revert`)
      .set(auth[ANALYST.email]!)
      .expect(200);
    await loadClean();
    const entry = (await get('/renewals')).body.entries.find(
      (e: { lease: { suite: string } }) => e.lease.suite === target.suite,
    );
    expect(entry.stage).toBe('proposal');
  });
});

describe('review regressions', () => {
  const csvUpload = (text: string, name = 'a.csv') =>
    request(ctx.app)
      .post(`/properties/${pid}/imports`)
      .set(auth[ANALYST.email]!)
      .attach('file', Buffer.from(text), name);
  const GOOD = 'Suite,Tenant,SF,Annual Rent,Expiration,Notice\n100,Acme,1000,100000,1/1/2030,12\n';

  it('treats a blank commission rate as missing, and documents the query', async () => {
    const { body } = await csvUpload(GOOD);
    await confirm(body.import.id).expect(200);
    const id = (await get('/leases')).body.leases[0].id;
    await get(
      `/leases/${id}/commission?termYears=5&renewalLandlordBps=&renewalTenantBps=1&newLandlordBps=1&newTenantBps=1`,
    ).expect(400);
    await get(
      `/leases/${id}/commission?termYears=5&renewalLandlordBps=1.5&renewalTenantBps=1&newLandlordBps=1&newTenantBps=1`,
    ).expect(400);
    const doc = await request(ctx.app).get('/openapi.json').expect(200);
    const params = doc.body.paths['/properties/{id}/leases/{leaseId}/commission'].get.parameters;
    expect(
      params.filter((p: { in: string; required: boolean }) => p.in === 'query' && p.required),
    ).toHaveLength(5);
  });

  it('leaves one current rent roll when two imports confirm in parallel', async () => {
    const a = (await csvUpload(GOOD)).body.import.id;
    const b = (await csvUpload(GOOD)).body.import.id;
    const results = await Promise.all([confirm(a), confirm(b)]);
    expect(results.some((r) => r.status === 200)).toBe(true);
    expect((await get('/leases')).body.leases).toHaveLength(1);
    const statuses = (await get('/imports')).body.imports.map((i: { status: string }) => i.status);
    expect(statuses.filter((s: string) => s === 'confirmed')).toHaveLength(1);
  });

  it('blocks an absurd per-SF rent instead of failing the response', async () => {
    const res = await csvUpload(
      'Suite,Tenant,SF,Annual $/SF,Expiration,Notice\n1,A,10000000,1000000000,1/1/2030,12\n',
    ).expect(201);
    expect(res.body.review.canConfirm).toBe(false);
    expect(res.body.review.leases[0].annualRentCents).toBeNull();
  });

  it('keeps note edits in a batch, and lets a note be cleared', async () => {
    const { body } = await csvUpload(GOOD);
    await confirm(body.import.id).expect(200);
    const moves = (m: object[]) =>
      request(ctx.app)
        .post(`/properties/${pid}/renewals/moves`)
        .set(auth[ANALYST.email]!)
        .send({ moves: m })
        .expect(200);
    const note = async () => (await get('/renewals')).body.entries[0].note;
    await moves([
      { suite: '100', stage: 'contacted', note: 'called' },
      { suite: '100', stage: 'proposal' },
    ]);
    expect(await note()).toBe('called');
    await moves([{ suite: '100', stage: 'proposal', note: null }]);
    expect(await note()).toBeNull();
  });

  const rawUpload = (disposition: string) =>
    request(ctx.app)
      .post(`/properties/${pid}/imports`)
      .set(auth[ANALYST.email]!)
      .set('Content-Type', 'multipart/form-data; boundary=b')
      .send(`--b\r\nContent-Disposition: form-data; name="file"; ${disposition}\r\n\r\n${GOOD}\r\n--b--\r\n`);

  it('counts missing rent and area in rollover buckets and projected vacating', async () => {
    const { body } = await csvUpload(
      'Suite,Tenant,SF,Annual Rent,Expiration,Notice\n100,Acme,,,1/1/2030,12\n200,Beta,1000,5000,1/1/2030,12\n',
    );
    await confirm(body.import.id).expect(200);
    const moves = { moves: [{ suite: '100', stage: 'vacating', vacatingReason: 'Moving' }] };
    await request(ctx.app)
      .post(`/properties/${pid}/renewals/moves`)
      .set(auth[ANALYST.email]!)
      .send(moves)
      .expect(200);
    const roll = (await get('/rollover').expect(200)).body;
    const y2030 = roll.schedule.years.find((y: { year: number }) => y.year === 2030);
    expect(y2030).toMatchObject({
      leases: 2,
      leasesMissingRent: 1,
      leasesMissingArea: 1,
      annualRentCents: 500_000,
    });
    expect(roll.projectedVacating).toEqual({
      leases: 1,
      areaSf: 0,
      annualRentCents: 0,
      leasesMissingArea: 1,
      leasesMissingRent: 1,
    });
  });

  it('stores a non-ASCII filename correctly', async () => {
    const res = await csvUpload(GOOD, 'Théâtre.csv').expect(201);
    expect(res.body.import.filename).toBe('Théâtre.csv');
  });

  it('removes control characters from a filename, including NUL', async () => {
    const res = await rawUpload("filename*=utf-8''a%00b%01.csv").expect(201);
    expect(res.body.import.filename).toBe('ab.csv');
  });
});

describe('every property route is isolated by organization', () => {
  it("returns 404 on all of them for another organization's property, and leaves it unchanged", async () => {
    const id = await loadClean();
    const lease = (await get('/leases')).body.leases[0].id;
    const key = (await get('/attention')).body.items[0].key;
    const scoped = ctx.routes.filter((r) => r.path.startsWith('/properties/:id'));
    expect(scoped.length).toBeGreaterThan(15);
    const bodies: Record<string, object> = {
      mapping: { overrides: [] },
      confirm: { acknowledgeWarnings: true },
      moves: { moves: [{ suite: '110', stage: 'contacted' }] },
      'risk-weights': { time_to_expiry: 25, notice_urgency: 25, concentration: 25, loan_mismatch: 25 },
      ':key': { status: 'done' },
    };
    const query = '?termYears=1&newLandlordBps=1&newTenantBps=1&renewalLandlordBps=1&renewalTenantBps=1';
    for (const route of scoped) {
      const path = route.path
        .replace(':id', pid)
        .replace(':importId', id)
        .replace(':leaseId', lease)
        .replace(':key', key);
      let call = request(ctx.app)
        [route.method](path + (path.endsWith('commission') ? query : ''))
        .set(auth[OTHER.email]!);
      if (route.upload) call = call.attach('file', Buffer.from('Suite,Tenant,SF\n1,A,1\n'), 'a.csv');
      else if (route.method !== 'get' && route.method !== 'delete') {
        const body = Object.entries(bodies).find(([k]) => route.path.endsWith(k))?.[1] ?? {};
        call = call.send(body);
      }
      const res = await call;
      expect(res.status, `${route.method} ${route.path}`).toBe(404);
    }
    expect((await get('/leases')).body.leases.length).toBeGreaterThan(0);
    expect((await get('/imports')).body.imports).toHaveLength(1);
  });
});
