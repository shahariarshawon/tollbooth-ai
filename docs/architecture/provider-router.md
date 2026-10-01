# Provider Router (Phase 6)

This is the Phase 6 note on request routing, retries and timeouts. For the full provider architecture
(the `AIProvider` interface, each adapter, cost and tier tracking, the per-provider circuit breaker), see
[provider-architecture.md](provider-architecture.md), which this note assumes and does not repeat.

Phase 6 took the gateway from calling one provider to routing every request through one interface to
three providers, with Gemini active:

```
Gateway
  |
  v
AI Provider Router (apps/gateway/src/providers/provider.router.ts)
  |
  +--> Gemini provider     ACTIVE   (apps/gateway/src/providers/gemini.provider.ts)
  +--> OpenAI provider     READY    (apps/gateway/src/providers/openai.provider.ts)
  +--> Anthropic provider  READY    (apps/gateway/src/providers/anthropic.provider.ts)
```

## 1. Provider architecture

Three pieces, each doing one job:

- **`AIProvider`** (`provider.interface.ts`): the one contract every provider implements —
  `chatCompletion`, `streamCompletion`, `getModelInfo`, `validateModel`, `getProviderName`, `calculateUsage`,
  `isConfigured`, plus `id` and `type`. Nothing else in the gateway imports a provider SDK or parses a
  provider's own error shape.
- **One file per provider**, holding its request/response mapping, its own error classification, and (for
  Gemini and Anthropic) a pure `*.mapper.ts` that is unit tested without a network.
- **`ProviderRouter`**: given a model name, decides which `AIProvider` instance serves it.

This is intentionally flatter than a `providers/gemini/`, `providers/openai/` folder-per-provider layout:
with three providers and no provider-specific sub-components yet, one file per provider next to the
interface is easier to scan, and nothing stops splitting a provider into its own folder later if it grows
(the mapper files already show where that seam is).

## 2. Request routing flow

```
POST /v1/chat/completions
  1. API key -> rate limit -> budget pre-check -> DTO validation      (unchanged by Phase 6)
  2. ProviderRouter.resolve(model)
       a. model exists in ai_models?                 no  -> 400 model_not_found
       b. model is active?                            no  -> 400 model_unavailable
       c. for each provider offering this model, default-provider first:
            - its ai_providers row is ACTIVE, AND
            - an AIProvider is registered for its type, AND
            - that provider isConfigured() (has an API key)
          first match wins
       d. none match                                       -> 503 provider_unavailable
  3. traffic.admit(providerId, prices, ...)           token quota -> budget reservation -> circuit breaker
  4. provider.chatCompletion(request)                 retried internally on a transient failure (below)
  5. provider.calculateUsage(request, result)
  6. traffic.complete(...) / traffic.abort(...)        settles the budget reservation, records the outcome
  7. ai_requests row written; OpenAI-shaped response returned
```

Model-to-provider mapping is **data, not code**: a model is a row in `ai_models` with a foreign key to its
`ai_providers` row, not a hardcoded prefix rule (`gpt-*`, `claude-*`). Adding a model, repricing it, or
moving it to another provider is a database change, not a deploy. `GATEWAY_DEFAULT_PROVIDER` only breaks
ties when more than one active provider happens to offer the same model name.

## 3. Adding a new provider

1. Implement `AIProvider`. Copy `gemini.provider.ts` as a template; keep request/response translation in a
   pure `*.mapper.ts` so it is unit testable without a network.
2. Add its id to `ProviderId` (`provider.interface.ts`) and its type to the database `ProviderType` enum if
   it is new.
3. Add its known models to `providers/model-info.ts` (context window, max output, display name).
4. Register it in `providers.module.ts` (the `AI_PROVIDERS` factory).
5. Insert its `ai_providers` row and `ai_models` rows (prices) in `prisma/seed.ts`.
6. Add a local fake of its HTTP API under `test/support/`, and a block for it in
   `test/providers.e2e-spec.ts`. The shared `provider-contract.spec.ts` checks the interface for every
   provider in its list automatically once it is added there.

## 4. Error handling strategy

Every provider failure becomes a `ProviderError` with one of five kinds, decided once, in the provider that
saw the raw error — nothing downstream parses provider-specific text:

| Kind           | Meaning                                                          | Caller sees                     | Retried |  Counts against the circuit   |
| -------------- | ---------------------------------------------------------------- | ------------------------------- | :-----: | :---------------------------: |
| `bad_request`  | The provider refused the request itself                          | `400 provider_rejected_request` |   no    |              no               |
| `auth`         | Our own credentials were rejected                                | `503 provider_unavailable`      |   no    |              yes              |
| `rate_limited` | The provider's rate limit was reached                            | `503 provider_unavailable`      |   yes   | only if retries are exhausted |
| `timeout`      | The provider did not answer within `GATEWAY_PROVIDER_TIMEOUT_MS` | `503 provider_unavailable`      |   yes   | only if retries are exhausted |
| `unavailable`  | Outage, a 5xx, or the model is missing at the provider           | `503 provider_unavailable`      |   no    |              yes              |

### Timeout (Task 8)

Every HTTP call a provider makes carries `GATEWAY_PROVIDER_TIMEOUT_MS` (default 30 seconds) as an
`AbortSignal.timeout`. A call that does not finish in time surfaces as a `timeout` `ProviderError`; the
gateway never hangs past this on a single attempt.

### Retries (Task 7)

`withProviderRetry` (`provider-retry.ts`) wraps each provider's own HTTP call (not the whole gateway
pipeline) and retries only `timeout` and `rate_limited`, up to `GATEWAY_MAX_PROVIDER_RETRIES` extra times
(default 3), with a short linear backoff (100 ms × attempt number) between tries. Every provider shares the
same helper, so the policy is identical for Gemini, OpenAI and Anthropic.

`bad_request` and `auth` are not retried: the request or the credentials are exactly as wrong on attempt
two. `unavailable` is deliberately not retried either, even though an outage sounds "temporary": that kind
is what the per-provider circuit breaker already exists to detect (`provider:<id>:circuit`, see
provider-architecture.md). Retrying it here would both blur the breaker's consecutive-failure count and
make a caller wait several multiples of the timeout for a provider that is already down. Retrying is
reserved for failures that are cheap to retry and likely to be gone a moment later.

Retries are invisible to the circuit breaker and to the caller: `traffic-control.service.ts` only ever sees
one final success or failure per gateway request, however many attempts the provider made internally to get
there.

**Trade-off to know:** because each retried attempt reuses the full timeout, the worst case for a hanging
provider is `(1 + GATEWAY_MAX_PROVIDER_RETRIES) x GATEWAY_PROVIDER_TIMEOUT_MS` before the caller sees a
503 (around two minutes at the defaults). Lower `GATEWAY_MAX_PROVIDER_RETRIES` or
`GATEWAY_PROVIDER_TIMEOUT_MS` for a deployment where callers cannot wait that long.

### Streaming (`streamCompletion`)

Not implemented. Every provider's `streamCompletion` rejects immediately with
`ProviderError('bad_request', 'Streaming responses are not supported yet')`, so a client that asks for it
gets one clear, consistent answer instead of each adapter failing differently (or silently never
streaming). `POST /v1/chat/completions` already rejects `"stream": true` at the DTO layer before a provider
is even involved.

## 5. Future scaling approach

- **Failover.** The router currently resolves to one provider and stops; it does not try the next provider
  when the chosen one fails (the circuit breaker only stops sending it _more_ traffic). A natural next step
  is: on an `unavailable` or exhausted-retry failure, let the router try the next candidate from
  `resolve()`'s already-computed, default-first list before giving up.
  - Note: fixing the "network error" vs. "provider is down" conflation (below) matters for this to be
    safe, so a transient blip does not immediately move traffic to the fallback provider.
- **Model aliases.** A client must ask for a model that is literally in the catalogue. Mapping a
  provider-neutral alias (`"fast"`, `"reasoning"`) to a concrete model per tenant or plan is a catalogue
  change (a lookup table or an `ai_models` column), not a router change.
- **Finer-grained retry classification.** `unavailable` currently covers both "the provider is unreachable"
  and "the provider returned a 5xx it generated itself"; the first might be worth one quick retry before
  the circuit breaker gets involved, while the second usually should not be. Splitting that in
  `provider-http.ts`'s `errorForStatus` / catch block is a small, isolated change if this is ever needed.
- **Per-provider retry and timeout tuning.** Today `GATEWAY_MAX_PROVIDER_RETRIES` and
  `GATEWAY_PROVIDER_TIMEOUT_MS` are gateway-wide. A provider with a slower, more rate-limit-prone API could
  reasonably want its own values; `AppConfig` would need per-provider overrides, and each provider would
  read its own instead of the shared one.
- **Horizontal scale.** The router and every provider are stateless (the only state is the Redis-backed
  circuit breaker and the Postgres catalogue), so running more gateway instances needs no change here.

## Configuration

| Variable                              | Default  | Effect                                                                           |
| ------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `GOOGLE_AI_API_KEY`                   | none     | Gemini's key. Required for Gemini to serve traffic.                              |
| `GATEWAY_DEFAULT_PROVIDER`            | `gemini` | Tie-breaker when several active providers offer the same model name.             |
| `GATEWAY_PROVIDER_TIMEOUT_MS`         | `30000`  | Timeout for one provider attempt.                                                |
| `GATEWAY_MAX_PROVIDER_RETRIES`        | `3`      | Extra attempts for a `timeout` or `rate_limited` failure. `0` disables retrying. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | none     | Keys for the ready-but-disabled providers.                                       |

(`.env.example` carries the same variables with the same names and defaults; there is no separate
`DEFAULT_AI_PROVIDER` / `PROVIDER_TIMEOUT_MS` / `MAX_PROVIDER_RETRIES` name — they were kept under the
existing `GATEWAY_` prefix used by every other gateway setting, such as `GATEWAY_CIRCUIT_OPEN_MS` and
`GATEWAY_FAIL_OPEN`, for one consistent naming convention.)

## Testing

- `provider-contract.spec.ts`: every registered provider implements the full interface, including
  `getProviderName`, `validateModel` and a rejecting `streamCompletion`.
- `provider.router.spec.ts`: Gemini is chosen for a Gemini model; an unknown model is rejected; a disabled,
  unconfigured, or unregistered provider is rejected; the default provider wins a tie and
  `GATEWAY_DEFAULT_PROVIDER` changes that.
- `provider-retry.spec.ts`: `withProviderRetry` retries only a retryable kind, stops at `maxRetries`, and
  leaves a non-retryable failure alone.
- `test/providers.e2e-spec.ts`, `retry` block: against the real gateway and a local fake Gemini, a
  transient rate limit recovers on retry; a persistent one exhausts retries and answers 503; bad
  credentials, a rejected request, and an outage are each a single call, not retried.
- `test/traffic-control.e2e-spec.ts`, `circuit breaker` block (unchanged by Phase 6, re-verified against
  it): a sustained outage opens `provider:gemini:circuit` and the next call fails fast, proving retries and
  the circuit breaker do not interfere with each other.
