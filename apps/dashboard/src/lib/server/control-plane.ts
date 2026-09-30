import type { NextRequest } from 'next/server';
import type { TokenSet } from './session-cookies';

export const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL ?? 'http://localhost:3001';

export function controlPlane(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${CONTROL_PLANE_URL}${path}`, { ...init, cache: 'no-store' });
}

/** The address of the browser, so the control plane can rate limit and audit the real client. */
export function clientIpHeaders(request: NextRequest): Record<string, string> {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? { 'X-Forwarded-For': forwarded } : {};
}

/**
 * CSRF defence for state-changing requests, on top of SameSite=Lax cookies: a browser always sends
 * Origin on cross-site POSTs, and it must match this host.
 */
export function isCrossSite(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.headers.get('host');
  } catch {
    return true;
  }
}

const RECENT_MS = 15_000;
const refreshes = new Map<string, Promise<TokenSet | null>>();

async function exchange(refreshToken: string): Promise<TokenSet | null> {
  try {
    const response = await controlPlane('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    return response.ok ? ((await response.json()) as TokenSet) : null;
  } catch {
    return null;
  }
}

/**
 * Exchanges a refresh token for a new session.
 *
 * Refresh tokens rotate and work once, and a page usually fires several requests together. Without
 * coordination the second one would present an already-used token, which the control plane treats
 * as theft and answers by revoking the whole session. So concurrent (and immediately following)
 * callers share one exchange. This holds within one server instance; behind several instances use
 * sticky sessions or a shared lock.
 */
export function refreshSession(refreshToken: string): Promise<TokenSet | null> {
  const existing = refreshes.get(refreshToken);
  if (existing) return existing;

  const exchangePromise = exchange(refreshToken);
  refreshes.set(refreshToken, exchangePromise);
  setTimeout(() => refreshes.delete(refreshToken), RECENT_MS).unref?.();
  return exchangePromise;
}
