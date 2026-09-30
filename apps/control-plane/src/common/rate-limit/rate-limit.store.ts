export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

export interface RateLimitHit {
  /** Requests seen for this key in the current window, including this one. */
  count: number;
  /** Seconds until the window resets. */
  ttlSeconds: number;
}

export interface RateLimitStore {
  /** Atomically counts one request against `key`, starting a window on the first hit. */
  hit(key: string, windowSeconds: number): Promise<RateLimitHit>;
}
