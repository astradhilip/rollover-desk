import { createApiClient } from '@rollover-desk/api-client';
import { LoginResponse } from '@rollover-desk/contracts';

export interface SessionOptions {
  apiUrl: string;
  email: string;
  password: string;
  fetch?: typeof fetch;
  /** Milliseconds since the epoch; injected so tests can pass a Retry-After window. */
  now?: () => number;
}

/** A refused login, kept so it can be replayed without asking the API again. */
interface Refusal {
  status: number;
  body: string;
  headers: [string, string][];
  /** Retry no sooner than this; Infinity for wrong credentials, which won't fix themselves. */
  until: number;
}

const replay = (r: Refusal) => new Response(r.body, { status: r.status, headers: r.headers });

/**
 * The API client, signed in as the configured user. The organization and role come from that user's token,
 * exactly as for the dashboard, so this server can see nothing the user couldn't.
 *
 * Sign-in is shared by concurrent calls, and a refusal is remembered. The API locks an email after a few failed
 * logins, and that lock also blocks the person's own dashboard, so a wrong password here costs one attempt, not
 * one per tool call.
 */
export function createSession({
  apiUrl,
  email,
  password,
  fetch: doFetch = (...a) => fetch(...a),
  now = Date.now,
}: SessionOptions) {
  let token: string | null = null;
  let pending: Promise<string | Response> | null = null;
  let refusal: Refusal | null = null;

  async function login(): Promise<string | Response> {
    const response = await doFetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      refusal = {
        status: response.status,
        body: await response.text(),
        headers: [...response.headers.entries()],
        until:
          response.status === 429
            ? now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60) * 1000
            : response.status === 401
              ? Infinity
              : now(),
      };
      return replay(refusal);
    }
    const parsed = LoginResponse.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return new Response(null, { status: 502 });
    refusal = null;
    token = parsed.data.token;
    return token;
  }

  /** One sign-in at a time, shared by every caller waiting on it. */
  function signIn(): Promise<string | Response> {
    if (refusal && now() < refusal.until) return Promise.resolve(replay(refusal));
    pending ??= login().finally(() => {
      pending = null;
    });
    return pending;
  }

  const send = (input: Parameters<typeof fetch>[0], init: RequestInit | undefined, bearer: string) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${bearer}`);
    return doFetch(input, { ...init, headers });
  };

  const signedIn: typeof fetch = async (input, init) => {
    const first = token ?? (await signIn());
    if (typeof first !== 'string') return first;
    const response = await send(input, init, first);
    if (response.status !== 401) return response;
    // Tokens expire after hours, and this process can outlive one: sign in again once, then give up.
    // Drop the token only if it is still the rejected one, so a fresh one from another call is kept.
    if (token === first) token = null;
    const second = token ?? (await signIn());
    if (typeof second !== 'string') return second;
    return send(input, init, second);
  };

  return createApiClient({ baseUrl: apiUrl, fetch: signedIn });
}

export type Session = ReturnType<typeof createSession>;
