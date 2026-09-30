import type { RateLimitHit, RateLimitStore } from './rate-limit.store';

/** Process-local store for tests. Not suitable for multiple instances. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetsAt: number }>();

  hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    const now = Date.now();
    let window = this.windows.get(key);
    if (!window || window.resetsAt <= now) {
      window = { count: 0, resetsAt: now + windowSeconds * 1000 };
      this.windows.set(key, window);
    }
    window.count += 1;
    return Promise.resolve({
      count: window.count,
      ttlSeconds: Math.max(1, Math.ceil((window.resetsAt - now) / 1000)),
    });
  }

  reset(): void {
    this.windows.clear();
  }
}
