import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { controlPlane, isCrossSite } from '@/lib/server/control-plane';
import { clearSession, COOKIE_NAMES } from '@/lib/server/session-cookies';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (isCrossSite(request)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const refreshToken = request.cookies.get(COOKIE_NAMES.refresh)?.value;
  if (refreshToken) {
    // Revoke server-side so a copied refresh token dies too. Failure must not block sign-out.
    await controlPlane('/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }

  const response = new NextResponse(null, { status: 204 });
  clearSession(response);
  return response;
}
