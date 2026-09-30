import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  clientIpHeaders,
  controlPlane,
  isCrossSite,
  refreshSession,
} from '@/lib/server/control-plane';
import { applySession, clearSession, COOKIE_NAMES } from '@/lib/server/session-cookies';

/**
 * Authenticated pass-through to the control plane.
 *
 * The browser sends only its httpOnly session cookies. This route adds the Bearer token, and when
 * the access token is missing or rejected it refreshes the session once and retries, so the client
 * never handles tokens.
 */
async function forward(request: NextRequest, path: string[], accessToken?: string) {
  const headers: Record<string, string> = { ...clientIpHeaders(request) };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;
  const tenantId = request.headers.get('x-tenant-id');
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  return controlPlane(`/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
  });
}

async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;

  // Credentials are issued only by the dedicated /api/auth routes, never through this pass-through.
  if (path[0] === 'auth') return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (request.method !== 'GET' && isCrossSite(request)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const refreshToken = request.cookies.get(COOKIE_NAMES.refresh)?.value;
  let accessToken = request.cookies.get(COOKIE_NAMES.access)?.value;
  let renewed: Awaited<ReturnType<typeof refreshSession>> = null;
  let refreshFailed = false;

  const renew = async (): Promise<boolean> => {
    if (!refreshToken) return false;
    renewed = await refreshSession(refreshToken);
    refreshFailed = renewed === null;
    if (renewed) accessToken = renewed.accessToken;
    return renewed !== null;
  };

  if (!accessToken) await renew();

  let upstream: Response;
  try {
    upstream = await forward(request, path, accessToken);
    if (upstream.status === 401 && !renewed && (await renew())) {
      upstream = await forward(request, path, accessToken);
    }
  } catch {
    return NextResponse.json({ message: 'The service is unavailable right now' }, { status: 502 });
  }

  const noBody = upstream.status === 204 || upstream.status === 304;
  const response = new NextResponse(noBody ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
  });
  const upstreamType = upstream.headers.get('content-type');
  if (upstreamType) response.headers.set('Content-Type', upstreamType);
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) response.headers.set('Retry-After', retryAfter);

  if (renewed) applySession(response, renewed);
  // A dead session must be cleared so the route guard stops treating the browser as signed in.
  if (refreshFailed || (!accessToken && !refreshToken)) clearSession(response);
  return response;
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
