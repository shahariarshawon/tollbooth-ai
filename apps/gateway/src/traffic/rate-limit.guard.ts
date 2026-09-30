import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { GatewayErrors } from '../common/errors/gateway.exception';
import { RateLimitExceededException } from '../common/errors/traffic.exceptions';
import { logEvent } from '../common/logging/structured-logger';
import type { GatewayRequest } from '../common/types/gateway-request';
import { TrafficLimits } from './plan-limits';
import { RateLimiterService } from './rate-limiter.service';

/**
 * Pipeline step after the API key check: count this request against the tenant and API key limits.
 * Runs after ApiKeyGuard (which sets `request.auth`) and before anything costly, so an over-limit
 * caller is turned away before any validation, tokenizing or provider work happens.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: RateLimiterService,
    private readonly limits: TrafficLimits,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<GatewayRequest>();
    const response = http.getResponse<Response>();
    // The API key guard always runs first; this only protects against a wiring mistake.
    if (!request.auth) throw GatewayErrors.missingApiKey();

    const { auth } = request;
    const decision = await this.limiter.check(auth, this.limits.forAuth(auth));

    const headers = {
      'X-RateLimit-Limit-Requests': String(decision.limit),
      'X-RateLimit-Remaining-Requests': String(decision.remaining),
      'X-RateLimit-Reset-Requests': `${decision.resetSeconds}s`,
    };
    if (!decision.bypassed) {
      for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    }

    if (!decision.allowed) {
      logEvent(
        {
          event: 'rate_limit_blocked',
          requestId: request.id,
          tenantId: auth.tenantId,
          apiKeyId: auth.apiKeyId,
          scope: decision.scope,
          limit: decision.limit,
          window: '1m',
        },
        'warn',
      );
      throw new RateLimitExceededException(
        decision.scope === 'tenant'
          ? 'Request limit exceeded for this account. Please retry later.'
          : 'Request limit exceeded for this API key. Please retry later.',
        decision.resetSeconds,
        headers,
      );
    }
    return true;
  }
}
