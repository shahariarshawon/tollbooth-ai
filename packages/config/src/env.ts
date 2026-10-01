import { z } from 'zod';

const DURATION = /^\d+[smhd]$/;

/** `KEY=` in a .env file arrives as an empty string; treat it as unset. */
const blankToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

/** Accepts only the strings "true" and "false", so a typo fails loudly instead of quietly meaning false. */
const envBoolean = (fallback: boolean) =>
  z.preprocess(
    (value) =>
      value === '' ? undefined : value === 'true' ? true : value === 'false' ? false : value,
    z.boolean().default(fallback),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  /** When set, Redis is configured from these discrete values and REDIS_URL is ignored by the gateway. */
  REDIS_HOST: z.preprocess(blankToUndefined, z.string().optional()),
  REDIS_PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).optional()),
  REDIS_PASSWORD: z.preprocess(blankToUndefined, z.string().optional()),
  REDIS_TLS: envBoolean(false),
  /** A Redis command slower than this fails, so a struggling Redis cannot stall every request. */
  REDIS_COMMAND_TIMEOUT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(50).default(1000),
  ),
  KAFKA_BROKER: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRE: z
    .string()
    .regex(DURATION, 'use a number and a unit: 30s, 15m, 12h, 7d')
    .default('15m'),
  JWT_REFRESH_EXPIRE: z
    .string()
    .regex(DURATION, 'use a number and a unit: 30s, 15m, 12h, 7d')
    .default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  OPENAI_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  ANTHROPIC_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  GOOGLE_AI_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  /** Which provider serves a model when several active ones offer it. Gemini is the primary provider. */
  GATEWAY_DEFAULT_PROVIDER: z.preprocess(
    blankToUndefined,
    z.enum(['gemini', 'openai', 'anthropic']).default('gemini'),
  ),
  /** Google AI Studio (Gemini API) endpoint, including the API version. */
  GOOGLE_AI_BASE_URL: z.preprocess(
    blankToUndefined,
    z.string().url().default('https://generativelanguage.googleapis.com/v1beta'),
  ),
  ANTHROPIC_BASE_URL: z.preprocess(
    blankToUndefined,
    z.string().url().default('https://api.anthropic.com'),
  ),
  OPENAI_BASE_URL: z.preprocess(
    blankToUndefined,
    z.string().url().default('https://api.openai.com/v1'),
  ),
  /** Port for the gateway; falls back to PORT when unset. */
  GATEWAY_PORT: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(65535).optional(),
  ),
  /** Upper bound a client may request in max_tokens. */
  GATEWAY_MAX_TOKENS: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).default(4096)),
  /** How long the gateway waits for an AI provider before giving up. */
  /**
   * What the gateway does when Redis is unreachable. false (default) rejects requests, because limits
   * and budgets cannot be enforced; true lets them through, trading protection for availability.
   */
  GATEWAY_FAIL_OPEN: envBoolean(false),
  /** Consecutive provider failures that open the circuit breaker. */
  GATEWAY_CIRCUIT_FAILURE_THRESHOLD: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).default(5),
  ),
  /** How long an open circuit rejects calls before allowing a trial request. */
  GATEWAY_CIRCUIT_OPEN_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(100).default(30_000),
  ),
  /** How long the gateway waits for one provider attempt before giving up on it. */
  GATEWAY_PROVIDER_TIMEOUT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1000).default(30_000),
  ),
  /**
   * Extra attempts for a transient provider failure (timeout, provider rate limit) before the gateway
   * gives up and answers 503. 0 disables retrying. Never retried: bad credentials or a request the
   * provider rejected outright, and an outage, which the circuit breaker handles instead.
   */
  GATEWAY_MAX_PROVIDER_RETRIES: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).default(3),
  ),
});

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Parses and validates environment variables once at startup.
 * Fails fast with a readable message instead of surfacing undefined values later.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** Converts a duration such as `15m` or `7d` to seconds. */
export function durationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  return Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
}
