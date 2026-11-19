/**
 * Landing page content and architecture documentation references.
 * Every statement describes real behaviour implemented in the repository.
 */

export const REPO_URL = 'https://github.com/shahariarshawon/tollbooth-ai';

export const doc = (path: string): string => `${REPO_URL}/blob/main/${path}`;

export interface FlowStep {
  step: number;
  title: string;
  subtitle: string;
  detail: string;
  iconName: string;
}

/** The path of one `POST /v1/chat/completions` call, in order. */
export const REQUEST_FLOW: FlowStep[] = [
  {
    step: 1,
    title: 'API Key Verification',
    subtitle: 'Ingress & Scoping',
    detail: 'SHA-256 hashed lookup resolves tenant isolation, project boundaries, and allowed models.',
    iconName: 'KeyRound',
  },
  {
    step: 2,
    title: 'Atomic Quota & Limits',
    subtitle: 'Redis Lua Scripts',
    detail: 'Per-minute request and token sliding counters prevent noisy neighbors with zero race conditions.',
    iconName: 'Gauge',
  },
  {
    step: 3,
    title: 'Pre-Flight Budget Reserve',
    subtitle: 'Worst-Case Reservation',
    detail: 'Worst-case max_tokens cost is reserved in exact micro-dollars before touching any provider API.',
    iconName: 'Wallet',
  },
  {
    step: 4,
    title: 'Security & PII Guardrails',
    subtitle: 'FastAPI Microservice',
    detail: 'Evaluates prompts against rule heuristics, regex patterns, prompt-injection signatures, and PII.',
    iconName: 'ShieldAlert',
  },
  {
    step: 5,
    title: 'Provider Router & Breaker',
    subtitle: 'Gemini, OpenAI, Anthropic',
    detail: 'Routes to target provider adapter. Distributed circuit breaker prevents hammering degraded providers.',
    iconName: 'Cpu',
  },
  {
    step: 6,
    title: 'Settlement & Kafka Event',
    subtitle: 'Postgres & Stream',
    detail: 'Exact actual tokens settled in Postgres ledger; asynchronous usage event published to Kafka.',
    iconName: 'Database',
  },
];

export interface Capability {
  title: string;
  body: string;
  badge?: string;
}

export const CAPABILITIES: Capability[] = [
  {
    title: 'Unified OpenAI-Compatible API',
    body: 'Standard POST /v1/chat/completions across Google Gemini, OpenAI, and Anthropic. Drop-in replacement for existing client SDKs with zero application code changes.',
    badge: 'API Gateway',
  },
  {
    title: 'Pre-Flight Hard Budget Controls',
    body: 'Enforce hard spend guardrails in exact integer micro-dollars. Worst-case cost is reserved before execution and settled to real usage, preventing surprise overages.',
    badge: 'FinOps',
  },
  {
    title: 'Multi-Tenant by Construction',
    body: 'Every entity carries its tenantId. Composite foreign keys prevent cross-tenant data leakage at the PostgreSQL schema layer, not just application code.',
    badge: 'Security',
  },
  {
    title: 'Input Guardrails & PII Masking',
    body: 'FastAPI prompt guard service inspects incoming payloads for prompt injections, system prompt leak attempts, and sensitive PII with configurable allow/block/redact policies.',
    badge: 'Safety',
  },
  {
    title: 'Atomic Redis Quotas & Breakers',
    body: 'Sliding-window rate limiters, token buckets, and stateful provider circuit breakers execute as atomic Lua scripts in Redis to eliminate distributed race conditions.',
    badge: 'Reliability',
  },
  {
    title: 'Kafka Usage Stream & Audit Trail',
    body: 'Usage events are streamed to Apache Kafka topics for asynchronous accounting, while an immutable audit log tracks every authentication, key creation, and policy mutation.',
    badge: 'Compliance',
  },
];

export interface ProblemSolution {
  problem: string;
  problemDetail: string;
  solution: string;
  solutionDetail: string;
}

export const PROBLEMS_SOLUTIONS: ProblemSolution[] = [
  {
    problem: 'Uncontrolled AI Runaway Spend',
    problemDetail: 'A buggy loop or unauthorized model call can generate thousands of dollars in unmonitored provider API bills overnight.',
    solution: 'Hard Micro-Dollar Pre-Flight Budgets',
    solutionDetail: 'Tollbooth reserves worst-case token costs before calling providers and cuts off requests the instant a tenant or team hits their budget cap.',
  },
  {
    problem: 'Provider Keys Sprawled in Every Service',
    problemDetail: 'Direct provider keys scattered across backend services cannot be revoked per team, leaked easily, and carry unrestricted privileges.',
    solution: 'Revocable Scoped Tollbooth Keys',
    solutionDetail: 'Services receive revocable, project-scoped Tollbooth keys. Provider master credentials remain safely sealed inside the gateway vault.',
  },
  {
    problem: 'Provider Outages Crash User Features',
    problemDetail: 'When a model provider suffers latency spikes or 503 errors, dependent features fail completely without circuit breaking or failover.',
    solution: 'Distributed Circuit Breakers & Retries',
    solutionDetail: 'Redis-backed stateful circuit breakers detect degraded upstreams and fast-fail or route to backup models without cascading downtime.',
  },
  {
    problem: 'Zero Visibility Into Prompt Safety & Audit',
    problemDetail: 'No unified log of who called what, what prompts contained sensitive customer PII, or which team generated which proportion of costs.',
    solution: 'Integrated Guardrails & Kafka Telemetry',
    solutionDetail: 'Every prompt is scrubbed for PII, every request records exact tokens/cost/latency, and all operational events stream to Kafka and Postgres.',
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

export interface CodeExample {
  language: string;
  title: string;
  code: string;
}

export const CODE_EXAMPLES: CodeExample[] = [
  {
    language: 'curl',
    title: 'cURL',
    code: `curl https://gateway.tollbooth.ai/v1/chat/completions \\
  -H "Authorization: Bearer tb_live_9f83ac12e4b7801a..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [{ "role": "user", "content": "Analyze quarterly token usage" }]
  }'`,
  },
  {
    language: 'python',
    title: 'Python (OpenAI SDK)',
    code: `from openai import OpenAI

# Simply redirect baseURL to your Tollbooth AI gateway
client = OpenAI(
    base_url="https://gateway.tollbooth.ai/v1",
    api_key="tb_live_9f83ac12e4b7801a..."
)

response = client.chat.completions.create(
    model="gemini-2.0-flash",
    messages=[{"role": "user", "content": "Analyze quarterly token usage"}]
)
print(response.choices[0].message.content)`,
  },
  {
    language: 'typescript',
    title: 'TypeScript (Node.js)',
    code: `import OpenAI from 'openai';

// 1-line configuration: point official OpenAI SDK to Tollbooth
const openai = new OpenAI({
  baseURL: 'https://gateway.tollbooth.ai/v1',
  apiKey: process.env.TOLLBOOTH_API_KEY,
});

const completion = await openai.chat.completions.create({
  model: 'gemini-2.0-flash',
  messages: [{ role: 'user', content: 'Analyze quarterly token usage' }],
});
console.log(completion.choices[0].message.content);`,
  },
];

export const CURL_EXAMPLE = CODE_EXAMPLES[0]?.code ?? '';

export const USE_CASES = [
  {
    badge: 'Centralized AI Platform',
    title: 'One Ingress For All Internal Engineering Teams',
    description:
      'Instead of issuing raw OpenAI, Gemini, and Anthropic keys to dozens of product squads, centralize access through Tollbooth. Platform engineers configure provider credentials once and issue scoped keys to teams with discrete rate limits.',
  },
  {
    badge: 'Multi-Tenant SaaS',
    title: 'Per-Customer Hard Quotas & Spend Attribution',
    description:
      'Building generative AI features into your B2B SaaS? Enforce strict monthly token quotas per customer organization. When a tenant reaches their allocated budget tier, the gateway automatically rejects excess requests before calling providers.',
  },
  {
    badge: 'Enterprise Security & Compliance',
    title: 'Full Audit Trail, Prompt Guardrails & PII Scrubbing',
    description:
      'Ensure AI requests comply with internal security policies. The gateway inspects payloads for prompt injections and credit card/SSN data, rejects violating prompts, and logs immutable audit records with complete token and latency metadata.',
  },
];

export const TECH_STACK = [
  { name: 'Next.js 16', role: 'Dashboard Frontend & App Router' },
  { name: 'NestJS', role: 'Control Plane Backend & Gateway Engine' },
  { name: 'Prisma 7 & PostgreSQL', role: 'Multi-Tenant Relational Storage' },
  { name: 'Redis 7 (Lua)', role: 'Atomic Rate Limits & Circuit Breakers' },
  { name: 'Apache Kafka', role: 'Asynchronous Usage Accounting Stream' },
  { name: 'FastAPI (Python)', role: 'Prompt Guard & Heuristic PII Service' },
  { name: 'Docker & Compose', role: 'Containerized Production Deployment' },
  { name: 'Prometheus & OpenTelemetry', role: 'Distributed Latency & Metrics' },
];
