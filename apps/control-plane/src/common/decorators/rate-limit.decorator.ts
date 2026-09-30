import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  /** Namespaces the counters, for example "login". */
  name: string;
  windowSeconds: number;
  /** Max requests per client IP in the window. */
  perIp: number;
  /** Max requests per `email` body field in the window. Optional. */
  perEmail?: number;
}

export const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
