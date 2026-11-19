/**
 * What the home page says. Every statement describes behaviour that exists in the code today; each
 * entry names the place to check it. No figures appear here: numbers belong on this page only once they
 * come from a measurement that is published next to them.
 */

export const REPO_URL = 'https://github.com/shahariarshawon/tollbooth-ai';

export const doc = (path: string): string => `${REPO_URL}/blob/main/${path}`;

export interface FlowStep {
  title: string;
  detail: string;
}

/** The path of one `POST /v1/chat/completions` call, in order. See docs/architecture/system-design.md. */
export const REQUEST_FLOW: FlowStep[] = [
  {
    title: 'API key',
    detail: 'The key is hashed and looked up. It names the tenant, project and permissions.',
  },
  {
    title: 'Rate limit and quota',
    detail:
      'Requests and tokens per minute, counted atomically in Redis for the tenant and the key.',
  },
  {
    title: 'Budget',
    detail:
      'The worst-case cost is reserved before the call and settled to the real cost after it.',
  },
  {
    title: 'Security check',
    detail:
      'A microservice evaluates prompts against rule-based and regex heuristics for PII, injection patterns, and disallowed content.',
  },
  {
    title: 'Provider router',
    detail:
      'Routes to the target provider adapter (Gemini, OpenAI, Anthropic). A shared circuit breaker prevents requests to failing upstream providers.',
  },
  {
    title: 'Record',
    detail:
      'Usage, cost and a ledger entry are written synchronously to Postgres, and a usage event is published asynchronously to Kafka.',
  },
];

export interface Capability {
  title: string;
  body: string;
}

export const CAPABILITIES: Capability[] = [
  {
    title: 'Unified Chat API for model providers',
    body: 'Standard OpenAI-compatible chat completions (POST /v1/chat/completions) across Gemini, OpenAI and Anthropic with exact-match model authorization and pre-flight budget reservation (synchronous responses; streaming is planned).',
  },
  {
    title: 'Spend you can cap',
    body: 'Per-tenant budget guardrails in exact integer micro-dollars, an append-only usage ledger, and alerts as spending thresholds are crossed.',
  },
  {
    title: 'Multi-tenant by construction',
    body: 'Every row carries its tenant, and composite foreign keys make a cross-tenant link impossible at the database, not only in the code.',
  },
  {
    title: 'Roles and an audit trail',
    body: 'Six roles over one permission matrix, shared by the API that enforces it and the dashboard that reflects it. Sensitive actions are logged.',
  },
  {
    title: 'Safe sessions',
    body: 'Short-lived access tokens, rotating refresh tokens with replay detection, and tokens kept in httpOnly cookies the browser scripts cannot read.',
  },
  {
    title: 'Operable',
    body: 'Structured logs with a request id, Prometheus metrics, health checks, and a defined behaviour when Redis or the security service is down.',
  },
];

export interface Highlight {
  title: string;
  body: string;
  where: string;
}

export const HIGHLIGHTS: Highlight[] = [
  {
    title: 'Atomic limits across instances',
    body: 'Counters, budget reservation and the circuit breaker run as Lua scripts inside Redis, so two gateway instances can never both spend the last token or both become the trial call.',
    where: 'docs/architecture/redis-layer.md',
  },
  {
    title: 'Fail closed, on purpose',
    body: 'If Redis is unreachable the gateway refuses requests, because limits and budgets cannot be enforced. A switch trades that for availability, and the default is the safe one.',
    where: 'docs/architecture/redis-layer.md',
  },
  {
    title: 'Bounded retries',
    body: 'Timeouts and provider rate limits are retried a limited number of times. Bad credentials, rejected requests and outages are not, so a failing provider is not hammered.',
    where: 'docs/architecture/provider-router.md',
  },
  {
    title: 'Refresh-token theft detection',
    body: 'A refresh token works once. Presenting a used one revokes the whole session family and is written to the audit log.',
    where: 'docs/api/authentication.md',
  },
];

export const CURL_EXAMPLE = `curl https://YOUR-GATEWAY/v1/chat/completions \\
  -H "Authorization: Bearer $TOLLBOOTH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [{ "role": "user", "content": "Say hello." }]
  }'`;
