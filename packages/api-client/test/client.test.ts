import { describe, expect, it } from 'vitest';
import { ApiClientError, createApiClient } from '../src/index';

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
const client = (f: typeof fetch) => createApiClient({ baseUrl: '/x', fetch: f });

describe('api client', () => {
  it('returns a body that matches its contract', async () => {
    const r = await client(reply(200, { properties: [] }) as typeof fetch).properties();
    expect(r.properties).toEqual([]);
  });
  it('refuses a body that does not match', async () => {
    await expect(client(reply(200, { nope: 1 }) as typeof fetch).properties()).rejects.toMatchObject({
      code: 'bad_response',
    });
  });
  it('keeps the API error code and message', async () => {
    const f = reply(409, { error: { code: 'conflict', message: 'Already confirmed.' } }) as typeof fetch;
    const e = await client(f)
      .imports('p')
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiClientError);
    expect(e).toMatchObject({ status: 409, code: 'conflict', message: 'Already confirmed.' });
  });
  it('reports a network failure', async () => {
    const f = (async () => {
      throw new TypeError('offline');
    }) as typeof fetch;
    await expect(client(f).me()).rejects.toMatchObject({ code: 'network' });
  });
  it('encodes path segments and sends the query', async () => {
    let url = '';
    const f = (async (u: string) => {
      url = u;
      return new Response('{"estimate":null,"reason":"x"}');
    }) as typeof fetch;
    await client(f).commission('a/b', 'c', {
      termYears: 5,
      renewalLandlordBps: 1,
      renewalTenantBps: 2,
      newLandlordBps: 3,
      newTenantBps: 4,
    });
    expect(url).toBe(
      '/x/properties/a%2Fb/leases/c/commission?termYears=5&renewalLandlordBps=1&renewalTenantBps=2&newLandlordBps=3&newTenantBps=4',
    );
  });
});
