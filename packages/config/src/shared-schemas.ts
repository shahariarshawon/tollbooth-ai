import { z } from 'zod';
import { blankToUndefined, DURATION, envBoolean, portNumber } from './primitives';

/**
 * Building blocks, exported as plain shapes so each service composes exactly the variables it reads
 * (`z.object({ ...baseShape, ...redisShape })`). A service never validates what it does not consume.
 */

export const baseShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
};

export const databaseShape = {
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// or postgresql:// URL'),
};

export const kafkaShape = {
  /** One host:port, or several separated by commas. */
  KAFKA_BROKER: z.string().min(1),
};

/**
 * Redis is configured either from one URL (which may carry credentials and TLS via `rediss://`) or
 * from discrete values. The discrete values win when REDIS_HOST is set.
 */
export const redisShape = {
  REDIS_URL: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  REDIS_HOST: z.preprocess(blankToUndefined, z.string().optional()),
  REDIS_PORT: z.preprocess(blankToUndefined, portNumber.optional()),
  REDIS_PASSWORD: z.preprocess(blankToUndefined, z.string().optional()),
  REDIS_TLS: envBoolean(false),
  /** A Redis command slower than this fails, so a struggling Redis cannot stall every request. */
  REDIS_COMMAND_TIMEOUT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(50).default(1000),
  ),
};

/** Redis needs an address from one of the two forms. Apply once, on the finished service schema. */
export function requireRedisTarget<
  T extends z.ZodType<{ REDIS_URL?: string; REDIS_HOST?: string }>,
>(schema: T): T {
  return schema.refine((env) => env.REDIS_URL !== undefined || env.REDIS_HOST !== undefined, {
    message: 'set REDIS_URL, or REDIS_HOST (with REDIS_PORT and REDIS_PASSWORD)',
    path: ['REDIS_URL'],
    // Report a missing Redis address together with other problems, instead of in a second pass.
    when: () => true,
  }) as T;
}

export const durationSchema = z
  .string()
  .regex(DURATION, 'use a number and a unit: 30s, 15m, 12h, 7d');
