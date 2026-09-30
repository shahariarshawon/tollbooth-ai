import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { logEvent } from '../logging/structured-logger';
import type { GatewayRequest } from '../types/gateway-request';

// Callers may supply their own id to trace a call end to end, but only a safe shape is accepted so a
// client cannot inject arbitrary text into our logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Gives every request an id (echoed as X-Request-ID) and writes one structured log line when the
 * response finishes. It runs outside the guards on purpose, so rejected requests are logged too.
 */
export function requestContextMiddleware(
  req: GatewayRequest,
  res: Response,
  next: NextFunction,
): void {
  const supplied = req.headers['x-request-id'];
  req.id =
    typeof supplied === 'string' && SAFE_REQUEST_ID.test(supplied)
      ? supplied
      : `req_${randomUUID().replaceAll('-', '')}`;
  res.setHeader('X-Request-ID', req.id);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const body = req.body as { model?: unknown } | undefined;
    logEvent({
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      statusCode: res.statusCode,
      tenantId: req.auth?.tenantId ?? null,
      projectId: req.auth?.projectId ?? null,
      model: typeof body?.model === 'string' ? body.model.slice(0, 100) : null,
      latency: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
    });
  });
  next();
}
