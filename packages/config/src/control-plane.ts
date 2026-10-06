import { z } from 'zod';
import { blankToUndefined, envBoolean, optionalPort, parseConfig, resolvePort } from './primitives';
import {
  baseShape,
  databaseShape,
  durationSchema,
  redisShape,
  requireRedisTarget,
} from './shared-schemas';

const CONTROL_PLANE_DEFAULT_PORT = 3001;

const controlPlaneObject = z.object({
  ...baseShape,
  ...databaseShape,
  ...redisShape,

  /** Shared port, injected by container platforms. `CONTROL_PLANE_PORT` takes precedence. */
  PORT: optionalPort,
  CONTROL_PLANE_PORT: optionalPort,

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRE: durationSchema.default('15m'),
  JWT_REFRESH_EXPIRE: durationSchema.default('7d'),
  BCRYPT_ROUNDS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(10).max(15).default(12),
  ),

  /**
   * Turns on POST /auth/demo, which starts a short read-only session in the seeded demo workspace.
   * Off by default: a deployment without it has no passwordless way in.
   */
  DEMO_MODE: envBoolean(false),
  /** How long a demo session lasts, in total. Refreshing never extends it. */
  DEMO_SESSION_MINUTES: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(5).max(240).default(30),
  ),
  /** The demo workspace's user. Defaults to the address the demo seed creates. */
  DEMO_USER_EMAIL: z.preprocess(blankToUndefined, z.string().email().optional()),

  /**
   * How many reverse proxies sit in front of this service and set X-Forwarded-For. 0 (default) ignores
   * the header and uses the connection address. Set it only to the real number: a larger value lets a
   * client choose its own address by sending the header itself.
   */
  TRUST_PROXY_HOPS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).max(5).default(0),
  ),
});

const controlPlaneSchema = requireRedisTarget(controlPlaneObject).transform(
  ({ CONTROL_PLANE_PORT, PORT, ...rest }) => ({
    ...rest,
    PORT: resolvePort(CONTROL_PLANE_PORT, PORT, CONTROL_PLANE_DEFAULT_PORT),
  }),
);

export type ControlPlaneConfig = z.output<typeof controlPlaneSchema>;

/** Validates the environment the control plane reads. Throws one message listing every problem. */
export function loadControlPlaneConfig(env: NodeJS.ProcessEnv = process.env): ControlPlaneConfig {
  return parseConfig(controlPlaneSchema, env);
}
