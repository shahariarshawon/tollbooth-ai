import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { clientIpHeaders, controlPlane, isCrossSite } from '@/lib/server/control-plane';
import { isDemoEnabled } from '@/lib/server/demo';
import { applySession } from '@/lib/server/session-cookies';
import type { TokenSet } from '@/lib/server/session-cookies';

/**
 * Starts a read-only session in the demo workspace. The control plane issues it without a password (the
 * demo account has none), and only when it is itself running with DEMO_MODE on. This route checks the
 * switch too, so a deployment that has not enabled the demo does not even forward the request.
 *
 * As with sign-in, only the user goes back to the browser: the tokens stay in httpOnly cookies.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isDemoEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (isCrossSite(request)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  let upstream: Response;
  try {
    upstream = await controlPlane('/auth/demo', {
      method: 'POST',
      headers: clientIpHeaders(request),
    });
  } catch {
    return NextResponse.json({ message: 'The service is unavailable right now' }, { status: 502 });
  }

  if (!upstream.ok) {
    const response = NextResponse.json(await upstream.json().catch(() => ({})), {
      status: upstream.status,
    });
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) response.headers.set('Retry-After', retryAfter);
    return response;
  }

  const tokens = (await upstream.json()) as TokenSet;
  const response = NextResponse.json({ user: tokens.user });
  applySession(response, tokens);
  return response;
}
