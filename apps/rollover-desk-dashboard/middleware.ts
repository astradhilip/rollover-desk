import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from './lib/session';

/** A convenience redirect only: the API checks the token on every request. */
export function middleware(request: NextRequest) {
  const signedIn = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const onSignIn = request.nextUrl.pathname === '/sign-in';
  if (!signedIn && !onSignIn) return NextResponse.redirect(new URL('/sign-in', request.url));
  if (signedIn && onSignIn) return NextResponse.redirect(new URL('/', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] };
