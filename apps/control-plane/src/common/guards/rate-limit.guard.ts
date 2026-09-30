import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
import type { RateLimitOptions } from '../decorators/rate-limit.decorator';
import { RATE_LIMIT_STORE } from '../rate-limit/rate-limit.store';
import type { RateLimitStore } from '../rate-limit/rate-limit.store';

/**
 * Brute-force protection for unauthenticated endpoints. Apply with @UseGuards and configure with
 * @RateLimit. It counts every request, not only failures, so it also limits credential stuffing
 * that mostly succeeds against weak accounts.
 *
 * Fails closed: if the store is unreachable the request is rejected, because silently disabling
 * brute-force protection is worse than briefly rejecting logins.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const keys = [
      { key: `rl:${options.name}:ip:${request.ip ?? 'unknown'}`, limit: options.perIp },
    ];

    const email = (request.body as { email?: unknown } | undefined)?.email;
    if (options.perEmail !== undefined && typeof email === 'string') {
      // Hashed so that addresses are not stored in Redis.
      const digest = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
      keys.push({ key: `rl:${options.name}:email:${digest}`, limit: options.perEmail });
    }

    let retryAfter = 0;
    try {
      for (const { key, limit } of keys) {
        const { count, ttlSeconds } = await this.store.hit(key, options.windowSeconds);
        if (count > limit) retryAfter = Math.max(retryAfter, ttlSeconds);
      }
    } catch (error) {
      this.logger.error('Rate limit store unavailable; rejecting request', error);
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    if (retryAfter > 0) {
      http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
