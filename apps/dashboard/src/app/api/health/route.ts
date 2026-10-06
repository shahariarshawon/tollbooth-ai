import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness for the container health check and the load balancer. It deliberately does not call the
 * control plane: a slow backend must not get a healthy dashboard container restarted.
 */
export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok', service: 'dashboard' });
}
