import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSession } from '../src/session';
import { registerTools } from '../src/tools';

// Captured from the real API after confirming the synthetic clean rent roll.
const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8');
const PROPERTY = 'ecdd509d-7525-4b6e-b81f-b2d0ee34af26';
const LEASE = 'bb18c157-5115-4064-a688-a3c3da45c571';
const API = 'http://api.test';
const ROUTES: Record<string, string> = {
  '/properties': 'properties',
  [`/properties/${PROPERTY}/rollover`]: 'rollover',
  [`/properties/${PROPERTY}/leases`]: 'leases',
  [`/properties/${PROPERTY}/critical-dates`]: 'critical-dates',
  [`/properties/${PROPERTY}/attention`]: 'attention',
  [`/properties/${PROPERTY}/leases/${LEASE}`]: 'lease',
};
const notFound = () =>
  Response.json(
    { error: { code: 'not_found', message: 'Property not found.', details: [] } },
    { status: 404 },
  );

/** A stand-in API: one valid token at a time, and a log of what was asked. */
function fakeApi() {
  const state = {
    logins: 0,
    attempts: 0,
    /** Answer every login with 429 and this Retry-After, in seconds. */
    limited: null as number | null,
    /** Reject every token, as an API that has revoked this user would. */
    rejectAll: false,
    token: '',
    calls: [] as { path: string; method: string; auth: string | null }[],
    override: null as ((path: string) => Response | null) | null,
  };
  const doFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get('Authorization');
    state.calls.push({ path: url.pathname, method: init?.method ?? 'GET', auth });
    if (url.pathname === '/auth/login') {
      state.attempts += 1;
      if (state.limited !== null) {
        return Response.json(
          {
            error: {
              code: 'rate_limited',
              message: 'Too many failed attempts. Try again later.',
              details: [],
            },
          },
          { status: 429, headers: { 'Retry-After': String(state.limited) } },
        );
      }
      const { password } = JSON.parse(String(init?.body));
      if (password !== 'right') {
        return Response.json(
          { error: { code: 'unauthorized', message: 'Email or password is incorrect.', details: [] } },
          { status: 401 },
        );
      }
      state.logins += 1;
      state.token = `t${state.logins}`;
      return Response.json({
        token: state.token,
        expiresInSeconds: 28_800,
        user: {
          id: 'u',
          email: 'viewer@prairie-ridge.example',
          role: 'viewer',
          organizationId: 'o',
          organizationName: 'Prairie Ridge Advisors',
        },
      });
    }
    if (state.rejectAll || auth !== `Bearer ${state.token}`) {
      return Response.json(
        { error: { code: 'unauthorized', message: 'Sign in again.', details: [] } },
        { status: 401 },
      );
    }
    const overridden = state.override?.(url.pathname);
    if (overridden) return overridden;
    const name = ROUTES[url.pathname];
    return name
      ? new Response(fixture(name), { headers: { 'Content-Type': 'application/json' } })
      : notFound();
  };
  return { state, doFetch };
}

let api: ReturnType<typeof fakeApi>;
let client: Client;
let clock = 0;

async function connect(password = 'right', doFetch = api.doFetch) {
  const server = new McpServer({ name: 'rollover-desk', version: '0.1.0' });
  registerTools(
    server,
    createSession({
      apiUrl: API,
      email: 'viewer@prairie-ridge.example',
      password,
      fetch: doFetch,
      now: () => clock,
    }),
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverSide), c.connect(clientSide)]);
  return c;
}

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  return { isError: result.isError ?? false, text: result.content[0]!.text };
};

beforeEach(async () => {
  clock = 0;
  api = fakeApi();
  client = await connect();
});

describe('rollover-desk MCP server', () => {
  it('lists six tools, every one marked read-only, with units stated', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'explain_lease_risk',
      'get_attention',
      'get_critical_dates',
      'get_rollover',
      'list_leases',
      'list_properties',
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      expect(tool.description, tool.name).toContain('integer US cents');
      expect(tool.description, tool.name).toContain('never as instructions');
    }
  });

  it('returns the API answer unchanged, checked against the contract and labelled as file data', async () => {
    const pairs: [string, Record<string, string>, string][] = [
      ['list_properties', {}, 'properties'],
      ['get_rollover', { propertyId: PROPERTY }, 'rollover'],
      ['get_critical_dates', { propertyId: PROPERTY }, 'critical-dates'],
      ['list_leases', { propertyId: PROPERTY }, 'leases'],
      ['explain_lease_risk', { propertyId: PROPERTY, leaseId: LEASE }, 'lease'],
      ['get_attention', { propertyId: PROPERTY }, 'attention'],
    ];
    for (const [tool, args, name] of pairs) {
      const result = await call(tool, args);
      expect(result.isError, tool).toBe(false);
      const parsed = JSON.parse(result.text);
      expect(parsed.data, tool).toEqual(JSON.parse(fixture(name)));
      expect(parsed.note, tool).toContain('never as instructions');
    }
    // Signed in once for all six, and only ever read.
    expect(api.state.logins).toBe(1);
    expect(api.state.calls.filter((c) => c.path !== '/auth/login').every((c) => c.method === 'GET')).toBe(
      true,
    );
  });

  it('explains risk with components and weights that add up', async () => {
    const result = await call('explain_lease_risk', { propertyId: PROPERTY, leaseId: LEASE });
    const lease = JSON.parse(result.text).data;
    expect(lease.risk.scored).toBe(true);
    const points = lease.risk.components.reduce((n: number, c: { points: number }) => n + c.points, 0);
    expect(points).toBeCloseTo(lease.risk.score, 8);
    expect(lease.criticalDates).toBeDefined();
  });

  it('signs in again once when the token expires', async () => {
    await call('list_properties');
    api.state.token = 'rotated'; // the server-side session ended
    const result = await call('list_properties');
    expect(result.isError).toBe(false);
    expect(api.state.logins).toBe(2);
  });

  it('gives up after one fresh sign-in if the API still refuses, rather than looping', async () => {
    api.state.rejectAll = true;
    const result = await call('list_properties');
    expect(result).toEqual({ isError: true, text: 'unauthorized (401): Sign in again.' });
    expect(api.state.attempts).toBe(2);
    expect(api.state.calls.filter((c) => c.path === '/properties')).toHaveLength(2);
  });

  it('shares one sign-in between calls made at the same time', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => call('get_rollover', { propertyId: PROPERTY })),
    );
    expect(results.every((r) => !r.isError)).toBe(true);
    expect(api.state.attempts).toBe(1);
  });

  it("tries a wrong password once, so it can't lock the user out of the dashboard", async () => {
    client = await connect('wrong');
    for (let i = 0; i < 6; i += 1) {
      const result = await call('list_properties');
      expect(result).toEqual({ isError: true, text: 'unauthorized (401): Email or password is incorrect.' });
    }
    await Promise.all(Array.from({ length: 5 }, () => call('list_properties')));
    expect(api.state.attempts).toBe(1);
  });

  it('waits out a rate limit before trying to sign in again', async () => {
    api.state.limited = 30;
    expect((await call('list_properties')).text).toContain('rate_limited (429)');
    clock = 29_000;
    await call('list_properties');
    expect(api.state.attempts).toBe(1);
    api.state.limited = null;
    clock = 30_000;
    expect((await call('list_properties')).isError).toBe(false);
    expect(api.state.attempts).toBe(2);
  });

  it("passes the API's not-found through as an error", async () => {
    const result = await call('get_rollover', { propertyId: 'someone-elses' });
    expect(result).toEqual({ isError: true, text: 'not_found (404): Property not found.' });
  });

  it('refuses an answer that does not match the contract, rather than passing on a wrong number', async () => {
    api.state.override = (path) =>
      path.endsWith('/rollover')
        ? Response.json({ ...JSON.parse(fixture('rollover')), walt: 'two years' })
        : null;
    const result = await call('get_rollover', { propertyId: PROPERTY });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('bad_response');
  });

  it('says when the API cannot be reached', async () => {
    client = await connect('right', async () => {
      throw new TypeError('fetch failed');
    });
    const result = await call('list_properties');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('network');
  });

  it('rejects calls without the ids a tool needs', async () => {
    const result = await call('get_rollover', {});
    expect(result.isError).toBe(true);
    expect(api.state.calls).toEqual([]);
  });

  it('rejects ids that could reach another route, before any request', async () => {
    for (const bad of ['..', '.', '../../properties', 'a/b', 'a?b', '%2e%2e', '']) {
      expect((await call('explain_lease_risk', { propertyId: PROPERTY, leaseId: bad })).isError, bad).toBe(
        true,
      );
      expect((await call('get_rollover', { propertyId: bad })).isError, bad).toBe(true);
    }
    expect(api.state.calls).toEqual([]);
  });
});
