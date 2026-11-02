import { type NextRequest, NextResponse } from 'next/server';
import {
  API_URL,
  cookieOptions,
  forwardPath,
  isBlockedPath,
  isSameOrigin,
  MAX_FORWARDED_BYTES,
  readLimited,
  SESSION_COOKIE,
} from '@/lib/session';

type Context = { params: Promise<{ path: string[] }> };

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

/** Adds the bearer token from the cookie. Only the content type and token go upstream; other cookies and headers don't. */
async function forward(request: NextRequest, { params }: Context) {
  const path = forwardPath((await params).path);
  if (!path || isBlockedPath(path)) return fail(404, 'not_found', 'Not found.');
  const write = request.method !== 'GET';
  if (write && !isSameOrigin(request.headers.get('origin'), request.headers.get('host'))) {
    return fail(403, 'forbidden', 'This request came from another site.');
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return fail(401, 'unauthorized', 'Sign in to continue.');
  const body = write ? await readLimited(request.body, MAX_FORWARDED_BYTES) : undefined;
  if (body === null) return fail(400, 'validation_error', 'The file is over the 10 MB limit.');
  const contentType = request.headers.get('content-type');
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}${path}${request.nextUrl.search}`, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, ...(contentType ? { 'Content-Type': contentType } : {}) },
      ...(body ? { body: body as BodyInit } : {}),
      cache: 'no-store',
    });
  } catch {
    return fail(502, 'internal_error', 'The API could not be reached.');
  }
  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) response.headers.set('Content-Disposition', disposition);
  if (upstream.status === 401) response.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return response;
}

export { forward as GET, forward as POST, forward as PUT, forward as DELETE };
