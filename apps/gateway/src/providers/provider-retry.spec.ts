import { isRetryableProviderError, withProviderRetry } from './provider-retry';
import { ProviderError } from './provider.interface';

describe('isRetryableProviderError', () => {
  it.each([
    ['timeout', true],
    ['rate_limited', true],
    ['bad_request', false],
    ['auth', false],
    ['unavailable', false],
  ] as const)('%s is retryable: %s', (kind, expected) => {
    expect(isRetryableProviderError(new ProviderError(kind, 'x'))).toBe(expected);
  });

  it('is false for anything that is not a ProviderError', () => {
    expect(isRetryableProviderError(new Error('boom'))).toBe(false);
    expect(isRetryableProviderError('boom')).toBe(false);
  });
});

describe('withProviderRetry', () => {
  it('returns the first success without retrying', async () => {
    const attempt = jest.fn().mockResolvedValue('ok');
    await expect(withProviderRetry(attempt, { maxRetries: 3 })).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable failure and returns the eventual success', async () => {
    const attempt = jest
      .fn()
      .mockRejectedValueOnce(new ProviderError('timeout', 'x'))
      .mockRejectedValueOnce(new ProviderError('rate_limited', 'x'))
      .mockResolvedValue('recovered');

    await expect(withProviderRetry(attempt, { maxRetries: 3, delayMs: () => 0 })).resolves.toBe(
      'recovered',
    );
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxRetries extra attempts and rethrows the last error', async () => {
    const attempt = jest.fn().mockRejectedValue(new ProviderError('rate_limited', 'still limited'));

    await expect(withProviderRetry(attempt, { maxRetries: 2, delayMs: () => 0 })).rejects.toThrow(
      'still limited',
    );
    expect(attempt).toHaveBeenCalledTimes(3); // the first attempt plus 2 retries
  });

  it('does not retry a non-retryable kind, even with retries left', async () => {
    const attempt = jest.fn().mockRejectedValue(new ProviderError('auth', 'bad key'));

    await expect(withProviderRetry(attempt, { maxRetries: 3, delayMs: () => 0 })).rejects.toThrow(
      'bad key',
    );
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('never retries when maxRetries is 0', async () => {
    const attempt = jest.fn().mockRejectedValue(new ProviderError('timeout', 'x'));

    await expect(withProviderRetry(attempt, { maxRetries: 0 })).rejects.toThrow('x');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('honours a custom isRetryable predicate', async () => {
    const attempt = jest.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue('ok');

    await expect(
      withProviderRetry(attempt, {
        maxRetries: 1,
        delayMs: () => 0,
        isRetryable: (error) => error instanceof Error && error.message === 'transient',
      }),
    ).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
