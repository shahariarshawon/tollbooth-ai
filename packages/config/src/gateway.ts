import { z } from 'zod';
import { blankToUndefined, envBoolean, optionalPort, parseConfig, resolvePort } from './primitives';
import {
  baseShape,
  databaseShape,
  kafkaShape,
  redisShape,
  requireRedisTarget,
} from './shared-schemas';

const GATEWAY_DEFAULT_PORT = 3000;

const optionalUrl = (fallback: string) =>
  z.preprocess(blankToUndefined, z.string().url().default(fallback));

const gatewayObject = z.object({
  ...baseShape,
  ...databaseShape,
  ...redisShape,
  ...kafkaShape,

  /** Shared port, injected by container platforms. `GATEWAY_PORT` takes precedence. */
  PORT: optionalPort,
  GATEWAY_PORT: optionalPort,

  OPENAI_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  ANTHROPIC_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  GOOGLE_AI_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  /** Which provider serves a model when several active ones offer it. Gemini is the primary provider. */
  GATEWAY_DEFAULT_PROVIDER: z.preprocess(
    blankToUndefined,
    z.enum(['gemini', 'openai', 'anthropic']).default('gemini'),
  ),
  /** Google AI Studio (Gemini API) endpoint, including the API version. */
  GOOGLE_AI_BASE_URL: optionalUrl('https://generativelanguage.googleapis.com/v1beta'),
  ANTHROPIC_BASE_URL: optionalUrl('https://api.anthropic.com'),
  OPENAI_BASE_URL: optionalUrl('https://api.openai.com/v1'),

  /** Upper bound a client may request in max_tokens. */
  GATEWAY_MAX_TOKENS: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).default(4096)),
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

  /** The AI Security Service (Python/FastAPI): PII, prompt-injection and content checks. */
  AI_SERVICE_URL: optionalUrl('http://localhost:8000'),
  /** How long the gateway waits for a security check before treating the service as unreachable. */
  GATEWAY_SECURITY_TIMEOUT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(100).default(3_000),
  ),
  /**
   * What the gateway does when the AI Security Service cannot be reached. false (default) rejects the
   * request with 503, because its content could not be checked; true lets it through unchecked, trading
   * that protection for availability. Mirrors GATEWAY_FAIL_OPEN's naming and default.
   */
  GATEWAY_SECURITY_FAIL_OPEN: envBoolean(false),
});

const gatewaySchema = requireRedisTarget(gatewayObject).transform(
  ({ GATEWAY_PORT, PORT, ...rest }) => ({
    ...rest,
    PORT: resolvePort(GATEWAY_PORT, PORT, GATEWAY_DEFAULT_PORT),
  }),
);

export type GatewayConfig = z.output<typeof gatewaySchema>;

/** Validates the environment the gateway reads. Throws one message listing every problem. */
export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return parseConfig(gatewaySchema, env);
}
