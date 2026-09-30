import { z } from 'zod';

const DURATION = /^\d+[smhd]$/;

/** `KEY=` in a .env file arrives as an empty string; treat it as unset. */
const blankToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
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
  GATEWAY_PROVIDER_TIMEOUT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1000).default(60_000),
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
