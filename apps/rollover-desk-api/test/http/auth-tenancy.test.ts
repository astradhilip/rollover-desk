import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '../../src/infrastructure/db/seed';
import { buildTestApp, SECRET } from './harness';

let ctx: Awaited<ReturnType<typeof buildTestApp>>;
const tokens: Record<string, string> = {};
const [PRAIRIE_ANALYST, PRAIRIE_VIEWER, OAK_ANALYST] = DEMO_USERS;
let prairiePropertyId: string;

const as = (email: string) => ({ Authorization: `Bearer ${tokens[email]}` });
const login = (email: string, password: string) =>
  request(ctx.app).post('/auth/login').send({ email, password });

beforeAll(async () => {
  ctx = await buildTestApp();
  for (const u of DEMO_USERS) tokens[u.email] = (await login(u.email, u.password).expect(200)).body.token;
  prairiePropertyId = (await request(ctx.app).get('/properties').set(as(PRAIRIE_ANALYST.email))).body
    .properties[0].id;
});

describe('login', () => {
  it('returns the user with no password material', async () => {
    const res = await login(PRAIRIE_ANALYST.email, PRAIRIE_ANALYST.password).expect(200);
    expect(res.body.user).toMatchObject({
      email: PRAIRIE_ANALYST.email,
      role: 'analyst',
      organizationName: 'Prairie Ridge Advisors',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|scrypt/i);
  });
  it('ignores email case', async () => {
    await login(PRAIRIE_VIEWER.email.toUpperCase(), PRAIRIE_VIEWER.password).expect(200);
  });
  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await login(OAK_ANALYST.email, 'nope').expect(401);
    const unknown = await login('nobody@example.com', 'nope').expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('unauthorized');
  });
  it('validates the request', async () => {
    const res = await request(ctx.app).post('/auth/login').send({ email: 'x' }).expect(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });
  it('rate limits repeated failures, even with the right password, then says when to retry', async () => {
    const own = await buildTestApp();
    const attempt = (password: string) =>
      request(own.app).post('/auth/login').send({ email: OAK_ANALYST.email, password });
    for (let i = 0; i < 5; i += 1) await attempt('wrong').expect(401);
    const limited = await attempt(OAK_ANALYST.password).expect(429);
    expect(limited.body.error.code).toBe('rate_limited');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('login limiter under pressure', () => {
  it('evaluates at most five guesses when sent in parallel', async () => {
    const own = await buildTestApp();
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(own.app).post('/auth/login').send({ email: OAK_ANALYST.email, password: 'wrong' }),
      ),
    );
    expect(results.filter((r) => r.status === 401)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(7);
  });
  it('does not count a server failure as a wrong password', async () => {
    const own = await buildTestApp();
    await own.db.destroy();
    for (let i = 0; i < 7; i += 1) {
      const res = await request(own.app)
        .post('/auth/login')
        .send({ email: OAK_ANALYST.email, password: 'x' });
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/driver|destroy|sql/i);
    }
  });
});

describe('every route declares and enforces its access', () => {
  const concrete = (path: string) => path.replace(':id', 'x');
  const call = (r: { method: 'get' | 'post'; path: string }) => request(ctx.app)[r.method](concrete(r.path));

  it('has only health and login public', () => {
    expect(ctx.routes.filter((r) => r.access === 'public').map((r) => r.path)).toEqual([
      '/health',
      '/auth/login',
    ]);
  });
  it('rejects a missing token on all others', async () => {
    for (const route of ctx.routes.filter((r) => r.access !== 'public')) {
      const res = await call(route).expect(401);
      expect(res.body.error.code, route.path).toBe('unauthorized');
    }
  });
  it('rejects forged, tampered, expired and wrong-audience tokens', async () => {
    const route = { method: 'get' as const, path: '/auth/me' };
    const sign = (key: string, build: (j: SignJWT) => SignJWT) =>
      build(
        new SignJWT({ org: 'o', role: 'analyst' }).setProtectedHeader({ alg: 'HS256' }).setSubject('u'),
      ).sign(new TextEncoder().encode(key));
    const good = (j: SignJWT) =>
      j.setIssuer('rollover-desk-api').setAudience('rollover-desk').setExpirationTime('1h');
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"u","org":"o","role":"analyst"}').toString('base64url')}.`;
    const bad = [
      await sign('another-secret-another-secret-another', good),
      await sign(SECRET, (j) =>
        j.setIssuer('rollover-desk-api').setAudience('other').setExpirationTime('1h'),
      ),
      await sign(SECRET, (j) => j.setIssuer('other').setAudience('rollover-desk').setExpirationTime('1h')),
      await sign(SECRET, (j) =>
        j.setIssuer('rollover-desk-api').setAudience('rollover-desk').setExpirationTime(1),
      ),
      `${tokens[OAK_ANALYST.email]}x`,
      none,
    ];
    for (const token of bad) await call(route).set('Authorization', `Bearer ${token}`).expect(401);
    await call(route).set('Authorization', tokens[OAK_ANALYST.email]!).expect(401);
  });
  it("rejects a viewer's writes on every analyst route", async () => {
    const writes = ctx.routes.filter((r) => r.access === 'analyst');
    expect(writes.length).toBeGreaterThan(0);
    for (const route of writes) {
      const res = await call(route).set(as(PRAIRIE_VIEWER.email)).send({}).expect(403);
      expect(res.body.error.code, route.path).toBe('forbidden');
    }
  });
  it('makes every non-GET route analyst-only', () => {
    const open = ctx.routes.filter((r) => r.method !== 'get' && r.access === 'viewer');
    expect(open).toEqual([]);
  });
});

describe('organizations are isolated', () => {
  it("returns 404 for another organization's property, the same as a missing one", async () => {
    const other = await request(ctx.app)
      .get(`/properties/${prairiePropertyId}`)
      .set(as(OAK_ANALYST.email))
      .expect(404);
    const missing = await request(ctx.app)
      .get('/properties/does-not-exist')
      .set(as(OAK_ANALYST.email))
      .expect(404);
    expect(other.body).toEqual(missing.body);
    await request(ctx.app).get(`/properties/${prairiePropertyId}`).set(as(PRAIRIE_VIEWER.email)).expect(200);
  });
  it('lists only your own', async () => {
    const res = await request(ctx.app).get('/properties').set(as(OAK_ANALYST.email)).expect(200);
    expect(res.body.properties).toEqual([]);
  });
  it('takes the organization only from the token, ignoring any in the request', async () => {
    const created = await request(ctx.app)
      .post('/properties')
      .set(as(OAK_ANALYST.email))
      .query({ organizationId: 'x', organization_id: 'x' })
      .set('X-Organization-Id', 'x')
      .send({
        name: 'Oak Plaza',
        loanMaturityDate: null,
        marketRentPsfCents: null,
        organizationId: 'x',
        organization_id: 'x',
      })
      .expect(201);
    expect(created.body).not.toHaveProperty('organizationId');
    await request(ctx.app).get(`/properties/${created.body.id}`).set(as(PRAIRIE_ANALYST.email)).expect(404);
    await request(ctx.app).get(`/properties/${created.body.id}`).set(as(OAK_ANALYST.email)).expect(200);
    const row = await ctx.db
      .selectFrom('properties')
      .select('organization_id')
      .where('id', '=', created.body.id)
      .executeTakeFirstOrThrow();
    const oak = await ctx.db
      .selectFrom('organizations')
      .select('id')
      .where('name', '=', 'Lone Oak Capital')
      .executeTakeFirstOrThrow();
    expect(row.organization_id).toBe(oak.id);
  });
});

describe('errors and hardening', () => {
  it('uses the one error shape for unknown routes and malformed JSON', async () => {
    const res = await request(ctx.app).get('/nope').expect(404);
    expect(res.body.error.code).toBe('not_found');
    const bad = await request(ctx.app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);
    expect(bad.body.error.code).toBe('validation_error');
  });
  it('validates dates and sizes before they reach the database', async () => {
    const post = (body: object) => request(ctx.app).post('/properties').set(as(OAK_ANALYST.email)).send(body);
    const base = { name: 'P', loanMaturityDate: null, marketRentPsfCents: null };
    await post({ ...base, loanMaturityDate: '2026-02-31' }).expect(400);
    await post({ ...base, marketRentPsfCents: 3_000_000_000 }).expect(400);
    await post({ ...base, name: 'a\u0000b' }).expect(400);
    await post({ ...base, loanMaturityDate: '2028-02-29' }).expect(201);
    await request(ctx.app).get('/properties/%00').set(as(OAK_ANALYST.email)).expect(404);
  });
  it('relaxes the content policy only for the docs page', async () => {
    const docs = await request(ctx.app).get('/docs/');
    expect(docs.headers['content-security-policy']).toBeUndefined();
    const api = await request(ctx.app).get('/health');
    expect(api.headers['content-security-policy']).toBeTruthy();
  });
  it('refuses an oversized body', async () => {
    const res = await login('a@example.com', 'x'.repeat(200_000));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
  it('sends security headers and no framework banner', async () => {
    const res = await request(ctx.app).get('/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  it('only allows configured browser origins', async () => {
    const ok = await request(ctx.app).get('/health').set('Origin', 'https://desk.example');
    expect(ok.headers['access-control-allow-origin']).toBe('https://desk.example');
    const no = await request(ctx.app).get('/health').set('Origin', 'https://evil.example');
    expect(no.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('publishes an OpenAPI document covering every route', async () => {
    const res = await request(ctx.app).get('/openapi.json').expect(200);
    expect(res.body.paths['/properties/{id}'].get['x-access']).toBe('viewer');
    expect(Object.keys(res.body.paths)).toHaveLength(new Set(ctx.routes.map((r) => r.path)).size);
  });
});
