import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { clientIpHeaders, controlPlane, isCrossSite } from '@/lib/server/control-plane';
import { applySession } from '@/lib/server/session-cookies';
import type { TokenSet } from '@/lib/server/session-cookies';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (isCrossSite(request)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  }
  const { email, password } = body as Record<string, unknown>;

  let upstream: Response;
  try {
    upstream = await controlPlane('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...clientIpHeaders(request) },
      body: JSON.stringify({ email, password }),
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
  // Only the user goes back to the browser. The tokens stay in httpOnly cookies.
  const response = NextResponse.json({ user: tokens.user });
  applySession(response, tokens);
  return response;
}
