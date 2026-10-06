import { z } from 'zod';

export const DURATION = /^\d+[smhd]$/;

/** `KEY=` in a .env file arrives as an empty string; treat it as unset. */
export const blankToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

/** Accepts only the strings "true" and "false", so a typo fails loudly instead of quietly meaning false. */
export const envBoolean = (fallback: boolean) =>
  z.preprocess(
    (value) =>
      value === '' ? undefined : value === 'true' ? true : value === 'false' ? false : value,
    z.boolean().default(fallback),
  );

export const portNumber = z.coerce.number().int().min(1).max(65535);

/** An optional port variable, where a blank value counts as unset. */
export const optionalPort = z.preprocess(blankToUndefined, portNumber.optional());

/**
 * The port a service listens on: its own variable (e.g. `GATEWAY_PORT`) first, then the shared `PORT`
 * that container platforms inject, then the service's default. The own variable lets several services
 * share one local .env file without colliding.
 */
export function resolvePort(
  own: number | undefined,
  shared: number | undefined,
  fallback: number,
): number {
  return own ?? shared ?? fallback;
}

/**
 * Validates `env` against `schema` and fails with one readable message that lists every problem,
 * instead of surfacing undefined values later.
 */
export function parseConfig<S extends z.ZodType>(schema: S, env: NodeJS.ProcessEnv): z.output<S> {
  const result = schema.safeParse(env);
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
