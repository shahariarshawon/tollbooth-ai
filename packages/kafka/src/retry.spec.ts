import { errorMessage, withBoundedRetry } from './retry';

describe('withBoundedRetry', () => {
  it('returns the first success without retrying', async () => {
    const attempt = jest.fn().mockResolvedValue('ok');
    await expect(withBoundedRetry(attempt, 3, () => 0)).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries a failure and returns the eventual success', async () => {
    const attempt = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('recovered');
    await expect(withBoundedRetry(attempt, 2, () => 0)).resolves.toBe('recovered');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries extra attempts and rethrows the last error', async () => {
    const attempt = jest.fn().mockRejectedValue(new Error('still failing'));
    await expect(withBoundedRetry(attempt, 2, () => 0)).rejects.toThrow('still failing');
    expect(attempt).toHaveBeenCalledTimes(3); // the first attempt plus 2 retries
  });
});

describe('errorMessage', () => {
  it('reads the message off an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies anything else', () => {
    expect(errorMessage('boom')).toBe('boom');
    expect(errorMessage({ code: 1 })).toBe('[object Object]');
  });
});
