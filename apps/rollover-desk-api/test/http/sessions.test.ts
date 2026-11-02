import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '../../src/infrastructure/db/seed';
import { buildTestApp } from './harness';

// Each test gets its own app: signing out changes state the other tests would share.
let ctx: Awaited<ReturnType<typeof buildTestApp>>;
const [PRAIRIE_ANALYST, PRAIRIE_VIEWER] = DEMO_USERS;

const signIn = async (u: { email: string; password: string }) =>
  (await request(ctx.app).post('/auth/login').send(u).expect(200)).body.token as string;
const me = (token: string) => request(ctx.app).get('/auth/me').set('Authorization', `Bearer ${token}`);
const logout = (token: string) =>
  request(ctx.app).post('/auth/logout').set('Authorization', `Bearer ${token}`);
const createProperty = (token: string) =>
  request(ctx.app).post('/properties').set('Authorization', `Bearer ${token}`).send({});

beforeEach(async () => {
  ctx = await buildTestApp();
});

describe('signing out', () => {
  it('ends every token the user has, and a new sign-in works', async () => {
    const laptop = await signIn(PRAIRIE_ANALYST!);
    const phone = await signIn(PRAIRIE_ANALYST!);
    await me(laptop).expect(200);
    await logout(laptop).expect(200, {});
    await me(laptop).expect(401);
    await me(phone).expect(401);
    await logout(laptop).expect(401);
    await me(await signIn(PRAIRIE_ANALYST!)).expect(200);
  });
  it("leaves other users' sessions alone", async () => {
    const analyst = await signIn(PRAIRIE_ANALYST!);
    const viewer = await signIn(PRAIRIE_VIEWER!);
    await logout(viewer).expect(200);
    await me(analyst).expect(200);
  });
  it('is open to a viewer, for their own sessions', async () => {
    await logout(await signIn(PRAIRIE_VIEWER!)).expect(200);
  });
});

describe('a token reflects the user record now, not at sign-in', () => {
  it('applies a role change on the next request', async () => {
    const token = await signIn(PRAIRIE_ANALYST!);
    await createProperty(token).expect(400);
    await ctx.db
      .updateTable('users')
      .set({ role: 'viewer' })
      .where('email', '=', PRAIRIE_ANALYST!.email)
      .execute();
    const res = await createProperty(token).expect(403);
    expect(res.body.error.code).toBe('forbidden');
    expect((await me(token).expect(200)).body.role).toBe('viewer');
  });
  it('refuses a deleted user', async () => {
    const token = await signIn(PRAIRIE_VIEWER!);
    await ctx.db.deleteFrom('users').where('email', '=', PRAIRIE_VIEWER!.email).execute();
    await me(token).expect(401);
  });
  it('refuses a token from an earlier session version', async () => {
    const token = await signIn(PRAIRIE_VIEWER!);
    await ctx.db
      .updateTable('users')
      .set((eb) => ({ session_version: eb('session_version', '+', 1) }))
      .where('email', '=', PRAIRIE_VIEWER!.email)
      .execute();
    await me(token).expect(401);
  });
});
