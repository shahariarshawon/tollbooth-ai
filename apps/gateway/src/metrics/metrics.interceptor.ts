import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { httpRequestDuration, httpRequestsTotal } from './metrics';

/** Records http_requests_total and http_request_duration_seconds for every inbound request. */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const startedAt = Date.now();

    const record = (statusCode: number): void => {
      const path = normalizePath(req.url ?? req.originalUrl ?? '/');
      const labels = { method: req.method, path, status: String(statusCode) };
      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe({ method: req.method, path }, (Date.now() - startedAt) / 1000);
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          record(res.statusCode);
        },
        error: (err: { status?: number }) => record(err?.status ?? 500),
      }),
    );
  }
}

function normalizePath(url: string): string {
  return (url.split('?')[0] ?? url)
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}
