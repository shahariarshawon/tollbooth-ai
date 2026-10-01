import { ProviderError } from './provider.interface';

export interface JsonResponse {
  status: number;
  /** Parsed JSON body, or null when the body was empty or not JSON. */
  data: unknown;
}

/**
 * POSTs JSON and returns the status and parsed body. Network-level failures become classified
 * ProviderErrors; HTTP error statuses are returned for the caller to interpret, because each provider
 * words its errors differently.
 */
export async function postJson(
  url: string,
  options: { headers: Record<string, string>; body: unknown; timeoutMs: number },
): Promise<JsonResponse> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const data: unknown = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch (error) {
    // Matched by name rather than instanceof: the abort error can come from another JavaScript realm.
    const name = (error as { name?: unknown } | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      return Promise.reject(new ProviderError('timeout', 'The provider timed out'));
    }
    return Promise.reject(new ProviderError('unavailable', 'Could not reach the provider'));
  }
}

/**
 * Maps an HTTP status from a provider to what it means for the gateway.
 *
 *  - 400/413/422: the caller's request was refused, and the provider's wording describes their input.
 *  - 401/403: our own credentials were rejected. The provider's text is never forwarded (it can echo
 *    part of the key).
 *  - 404: the model is in our catalogue but the provider does not have it, which is our configuration
 *    problem and not the caller's, so it is treated as the provider being unavailable.
 *  - 408: timeout. 429: provider rate limit. Everything else, including every 5xx: unavailable.
 */
export function errorForStatus(status: number, providerMessage: string | undefined): ProviderError {
  if (status === 400 || status === 413 || status === 422) {
    return new ProviderError('bad_request', providerMessage ?? 'The provider rejected the request');
  }
  if (status === 401 || status === 403) {
    return new ProviderError('auth', 'Provider rejected our credentials');
  }
  if (status === 408) return new ProviderError('timeout', 'The provider timed out');
  if (status === 429) return new ProviderError('rate_limited', 'Provider rate limit reached');
  return new ProviderError('unavailable', 'The provider returned an error');
}

/** Narrow an unknown JSON value to a plain object, or undefined. */
export function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
