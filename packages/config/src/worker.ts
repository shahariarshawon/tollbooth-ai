import { z } from 'zod';
import { optionalPort, parseConfig, resolvePort } from './primitives';
import { baseShape, kafkaShape } from './shared-schemas';

const WORKER_DEFAULT_PORT = 3003;

const workerSchema = z
  .object({
    ...baseShape,
    ...kafkaShape,

    /** Shared port, injected by container platforms. `WORKER_PORT` takes precedence. */
    PORT: optionalPort,
    WORKER_PORT: optionalPort,
  })
  .transform(({ WORKER_PORT, PORT, ...rest }) => ({
    ...rest,
    PORT: resolvePort(WORKER_PORT, PORT, WORKER_DEFAULT_PORT),
  }));

export type WorkerConfig = z.output<typeof workerSchema>;

/** Validates the environment the worker reads. Throws one message listing every problem. */
export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return parseConfig(workerSchema, env);
}
