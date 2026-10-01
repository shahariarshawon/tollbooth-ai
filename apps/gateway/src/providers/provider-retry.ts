import { ProviderError } from './provider.interface';

/**
 * Failures worth trying again: the provider was briefly unreachable in time (`timeout`) or asked us to
 * slow down (`rate_limited`). Both are plausibly gone a moment later.
 *
 * Deliberately NOT retried:
 *  - `bad_request` and `auth`: trying again sends the same bad input or the same bad credentials, so it
 *    would only fail the same way slower.
 *  - `unavailable`: an outage or a repeated 5xx. This is exactly what the per-provider circuit breaker
 *    (`provider:<id>:circuit`, see traffic-control.service.ts) is built to detect and react to by
 *    stopping traffic to that provider. Retrying it here would both blur the breaker's failure count and
 *    extend the time a caller waits for a provider that is already down.
 */
export function isRetryableProviderError(error: unknown): boolean {
  return (
    error instanceof ProviderError && (error.kind === 'timeout' || error.kind === 'rate_limited')
  );
}

export interface RetryOptions {
  /** Extra attempts after the first. 0 disables retrying. */
  maxRetries: number;
  /** Which failures are worth trying again; defaults to `isRetryableProviderError`. */
  isRetryable?: (error: unknown) => boolean;
  /** Delay before attempt number `n` (1-based). Defaults to a short linear backoff. */
  delayMs?: (attempt: number) => number;
}

const defaultDelay = (attempt: number): number => attempt * 100;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `attempt()`, retrying on a classified, transient `ProviderError` up to `maxRetries` extra times
 * with a short backoff between tries. Any other failure, or the last attempt's failure, is rethrown as-is
 * so callers keep seeing a plain `ProviderError`.
 */
export async function withProviderRetry<T>(
  attempt: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const isRetryable = options.isRetryable ?? isRetryableProviderError;
  const delay = options.delayMs ?? defaultDelay;

  for (let attemptNumber = 0; ; attemptNumber++) {
    try {
      return await attempt();
    } catch (error) {
      if (attemptNumber >= options.maxRetries || !isRetryable(error)) throw error;
      await sleep(delay(attemptNumber + 1));
    }
  }
}
