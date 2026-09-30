import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCrossSite } from '@/lib/server/control-plane';
import { COOKIE_NAMES, updateUserCookie } from '@/lib/server/session-cookies';
import type { SessionUser } from '@/types/api';

function readUser(request: NextRequest): SessionUser | null {
  const hasCredentials =
    request.cookies.has(COOKIE_NAMES.access) || request.cookies.has(COOKIE_NAMES.refresh);
  const raw = request.cookies.get(COOKIE_NAMES.user)?.value;
  if (!hasCredentials || !raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

/** Tells the UI who is signed in, from the session cookies alone (no call to the control plane). */
export function GET(request: NextRequest): NextResponse {
  // 200 with a null user (rather than 401) because being signed out is a normal state here.
  return NextResponse.json({ user: readUser(request) });
}

/**
 * Keeps the display name in the profile cookie in step after the control plane accepted a rename.
 * The cookie is a display cache: the control plane, not this cookie, decides what a user may do.
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (isCrossSite(request)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const user = readUser(request);
  if (!user) return NextResponse.json({ message: 'Not signed in' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { firstName, lastName } = body ?? {};
  const valid = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
  if (!valid(firstName) || !valid(lastName)) {
    return NextResponse.json({ message: 'Invalid name' }, { status: 400 });
  }

  const updated: SessionUser = { ...user, firstName: firstName.trim(), lastName: lastName.trim() };
  const response = NextResponse.json({ user: updated });
  updateUserCookie(response, updated);
  return response;
}
