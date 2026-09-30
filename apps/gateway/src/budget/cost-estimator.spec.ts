import {
  DEFAULT_OUTPUT_TOKEN_ESTIMATE,
  costMicroUsd,
  tokensToMicroUsd,
  worstCaseMicroUsd,
} from './cost-estimator';

describe('cost estimation for budget reservations', () => {
  // gpt-4 style prices: USD per 1,000,000 tokens.
  const prices = { input: '30.00', output: '60.00' };

  it('costs one micro-dollar per token for each dollar of price per million tokens', () => {
    expect(tokensToMicroUsd(1, 30)).toBe(30);
    expect(tokensToMicroUsd(1_000_000, 30)).toBe(30_000_000); // $30
  });

  it('rounds fractional costs up, so a reservation is never below the real cost', () => {
    expect(tokensToMicroUsd(3, 0.15)).toBe(1); // 0.45 -> 1
    expect(tokensToMicroUsd(10, 0.15)).toBe(2); // 1.5 -> 2
    expect(tokensToMicroUsd(0, 30)).toBe(0);
  });

  it('adds input and output costs', () => {
    expect(costMicroUsd(prices, 11, 7)).toBe(11 * 30 + 7 * 60);
  });

  it('accepts Decimal-like prices', () => {
    const decimal = { toString: () => '2.50' };
    expect(tokensToMicroUsd(4, decimal)).toBe(10);
  });

  it('prices the worst case with the caller max_tokens when given', () => {
    expect(worstCaseMicroUsd(prices, 100, 500)).toBe(100 * 30 + 500 * 60);
  });

  it('assumes a default output size when the caller sets no max_tokens', () => {
    expect(worstCaseMicroUsd(prices, 100, undefined)).toBe(
      100 * 30 + DEFAULT_OUTPUT_TOKEN_ESTIMATE * 60,
    );
  });

  it('always reserves at least what the request really cost', () => {
    const actual = costMicroUsd(prices, 100, 400);
    expect(worstCaseMicroUsd(prices, 100, 500)).toBeGreaterThanOrEqual(actual);
  });
});
