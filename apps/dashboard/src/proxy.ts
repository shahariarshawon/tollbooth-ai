import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Optimistic route guard: sends signed-out visitors to /login and signed-in ones away from it (and from /demo).
 * It only checks that a session cookie exists. Real authorization happens in the control plane
 * on every API call, so this is a UX convenience and not a security boundary.
 */
export function proxy(request: NextRequest): NextResponse {
  const signedIn = request.cookies.has('tb_user');
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/dashboard') && !signedIn) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }
  if ((pathname === '/login' || pathname === '/demo') && signedIn) {
    const dashboard = request.nextUrl.clone();
    dashboard.pathname = '/dashboard';
    dashboard.search = '';
    return NextResponse.redirect(dashboard);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*', '/login', '/demo'] };

export const middleware = proxy;
export default proxy;
