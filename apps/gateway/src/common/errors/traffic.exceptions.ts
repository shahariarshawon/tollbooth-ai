import { HttpStatus } from '@nestjs/common';
import { GatewayException } from './gateway.exception';

/**
 * Failures raised by the traffic controls (rate limits, quotas, budgets, circuit breaker). They render
 * in the same OpenAI style error shape as every other gateway error.
 */

/** 429. A request or token limit was reached. `retryAfterSeconds` tells the client when to try again. */
export class RateLimitExceededException extends GatewayException {
  constructor(
    message: string,
    retryAfterSeconds: number,
    extraHeaders: Record<string, string> = {},
  ) {
    super(
      HttpStatus.TOO_MANY_REQUESTS,
      { message, type: 'rate_limit_error', code: 'rate_limit_exceeded' },
      { 'Retry-After': String(retryAfterSeconds), ...extraHeaders },
    );
  }
}

/** 402. The tenant has used its monthly budget, or this request would exceed what is left. */
export class BudgetExceededException extends GatewayException {
  constructor(message = 'The monthly budget for this account has been reached.') {
    super(HttpStatus.PAYMENT_REQUIRED, { message, type: 'budget_error', code: 'budget_exceeded' });
  }
}

/** 503. The AI provider cannot serve the request: it failed, its circuit is open, or it is not configured. */
export class ProviderUnavailableException extends GatewayException {
  constructor(retryAfterSeconds?: number) {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      {
        message: 'The AI provider is currently unavailable. Please try again later.',
        type: 'api_error',
        code: 'provider_unavailable',
      },
      retryAfterSeconds === undefined ? {} : { 'Retry-After': String(retryAfterSeconds) },
    );
  }
}

/** 503. Limits and budgets could not be checked (Redis is down) and the gateway is set to fail closed. */
export class TrafficControlUnavailableException extends GatewayException {
  constructor() {
    super(HttpStatus.SERVICE_UNAVAILABLE, {
      message: 'Request limits could not be checked right now. Please try again shortly.',
      type: 'api_error',
      code: 'traffic_control_unavailable',
    });
  }
}
