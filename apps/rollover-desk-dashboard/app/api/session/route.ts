import { LoginResponse } from '@rollover-desk/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { API_URL, clientAddress, cookieOptions, isSameOrigin, SESSION_COOKIE } from '@/lib/session';

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers.get('origin'), request.headers.get('host'))) {
    return fail(403, 'forbidden', 'This request came from another site.');
  }
  const address = clientAddress(request.headers.get('x-forwarded-for'));
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(address ? { 'X-Forwarded-For': address } : {}) },
      body: await request.text(),
    });
  } catch {
    return fail(502, 'internal_error', 'The API could not be reached.');
  }
  const body: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) return NextResponse.json(body, { status: upstream.status });
  const parsed = LoginResponse.safeParse(body);
  if (!parsed.success) return fail(502, 'internal_error', 'The API sent an unexpected response.');
  const response = NextResponse.json({ user: parsed.data.user });
  response.cookies.set(SESSION_COOKIE, parsed.data.token, cookieOptions(parsed.data.expiresInSeconds));
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request.headers.get('origin'), request.headers.get('host'))) {
    return fail(403, 'forbidden', 'This request came from another site.');
  }
  const response = NextResponse.json({});
  response.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return response;
}
