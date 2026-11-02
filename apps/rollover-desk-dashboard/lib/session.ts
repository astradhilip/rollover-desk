// Pure rules for the session cookie and the same-origin check. The token stays in an httpOnly cookie: browser code never sees it.

export const SESSION_COOKIE = 'rd_session';
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const MAX_FORWARDED_BYTES = 11 * 1024 * 1024;

export function cookieOptions(maxAge: number, production = process.env.NODE_ENV === 'production') {
  return { httpOnly: true, sameSite: 'strict', secure: production, path: '/', maxAge } as const;
}

/**
 * CSRF protection alongside SameSite: a write must carry an Origin header naming this site.
 * Browsers always send one on these requests, so a missing header is refused. Behind a proxy that rewrites
 * Host, set PUBLIC_ORIGIN and the comparison uses that.
 */
export function isSameOrigin(
  origin: string | null,
  host: string | null,
  publicOrigin = process.env.PUBLIC_ORIGIN,
): boolean {
  if (!origin) return false;
  if (publicOrigin) return origin === publicOrigin;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** The path to forward, or null if it could climb out of the API root. */
export function forwardPath(segments: string[]): string | null {
  if (segments.some((s) => s === '.' || s === '..' || s === '' || /[\\/\0]/.test(s))) return null;
  return `/${segments.map(encodeURIComponent).join('/')}`;
}

/**
 * The address to pass to the API's login limiter. Without a trusted proxy in front, this header is whatever the
 * client sent, so it is dropped unless TRUSTED_PROXY says something appends the real address.
 */
export function clientAddress(
  forwardedFor: string | null,
  trusted = process.env.TRUSTED_PROXY === '1',
): string | null {
  if (!trusted) return null;
  const last = forwardedFor?.split(',').at(-1)?.trim();
  return last || null;
}

/** Reads a body, counting real bytes because Content-Length can be absent. Null when it goes over the limit. */
export async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  max: number,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Sign-in goes through /api/session, which keeps the token out of browser code. */
// Compared the way Express routes: case-insensitive, trailing slash ignored.
export const isBlockedPath = (path: string) => path.toLowerCase().replace(/\/+$/, '') === '/auth/login';
