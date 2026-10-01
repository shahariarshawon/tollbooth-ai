import type { NextResponse } from 'next/server';
import type { SessionUser } from '@/types/api';

/**
 * Session storage. Tokens live only in httpOnly cookies, so page scripts (and therefore XSS)
 * can never read them.
 *
 * - tb_at   access token, expires with the token
 * - tb_rt   refresh token, sent only to /api routes
 * - tb_user public profile for the UI and for the route guard; carries no credentials
 */
export const COOKIE_NAMES = { access: 'tb_at', refresh: 'tb_rt', user: 'tb_user' } as const;

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: SessionUser;
}

// Must not exceed the control plane JWT_REFRESH_EXPIRE (7d by default).
const REFRESH_MAX_AGE = Number(process.env.REFRESH_COOKIE_MAX_AGE_SECONDS ?? 7 * 24 * 60 * 60);

const base = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

export function applySession(response: NextResponse, tokens: TokenSet): void {
  response.cookies.set(COOKIE_NAMES.access, tokens.accessToken, {
    ...base,
    path: '/',
    maxAge: tokens.expiresIn,
  });
  response.cookies.set(COOKIE_NAMES.refresh, tokens.refreshToken, {
    ...base,
    path: '/api',
    maxAge: REFRESH_MAX_AGE,
  });
  response.cookies.set(COOKIE_NAMES.user, JSON.stringify(tokens.user), {
    ...base,
    httpOnly: false,
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}

/** Rewrites only the public profile cookie, for example after the user renames themselves. */
export function updateUserCookie(response: NextResponse, user: SessionUser): void {
  response.cookies.set(COOKIE_NAMES.user, JSON.stringify(user), {
    ...base,
    httpOnly: false,
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearSession(response: NextResponse): void {
  response.cookies.set(COOKIE_NAMES.access, '', { ...base, path: '/', maxAge: 0 });
  response.cookies.set(COOKIE_NAMES.refresh, '', { ...base, path: '/api', maxAge: 0 });
  response.cookies.set(COOKIE_NAMES.user, '', { ...base, path: '/', maxAge: 0 });
}
