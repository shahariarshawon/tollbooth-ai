/**
 * Turns tokens into money for budget reservations only.
 *
 * Amounts are integer micro-dollars (1 USD = 1,000,000). Model prices are stored as USD per 1,000,000
 * tokens, so one token costs exactly `price` micro-dollars, and the conversion is a multiplication.
 * Integers keep the Redis arithmetic exact; floating point dollars would drift.
 *
 * This is deliberately not the billing calculation. Nothing here writes `estimatedCost`, a ledger
 * entry or an invoice line; those belong to the billing phase. The figures only steer the fast budget
 * check in Redis.
 */

/** What a request is assumed to generate when the caller sets no max_tokens. */
export const DEFAULT_OUTPUT_TOKEN_ESTIMATE = 1024;

/** Anything numeric-like, so Prisma Decimal prices work without a conversion at the call site. */
type Price = number | string | { toString(): string };

export interface ModelPrices {
  /** USD per 1,000,000 input tokens. */
  input: Price;
  /** USD per 1,000,000 output tokens. */
  output: Price;
}

/** Rounded up: a reservation must never be smaller than the real cost. */
export function tokensToMicroUsd(tokens: number, pricePerMillionTokens: Price): number {
  return Math.ceil(tokens * Number(pricePerMillionTokens));
}

export function costMicroUsd(
  prices: ModelPrices,
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    tokensToMicroUsd(inputTokens, prices.input) + tokensToMicroUsd(outputTokens, prices.output)
  );
}

/** The most a request could cost: all its input, plus as many output tokens as it is allowed to produce. */
export function worstCaseMicroUsd(
  prices: ModelPrices,
  inputTokens: number,
  maxOutputTokens: number | undefined,
): number {
  return costMicroUsd(prices, inputTokens, maxOutputTokens ?? DEFAULT_OUTPUT_TOKEN_ESTIMATE);
}
