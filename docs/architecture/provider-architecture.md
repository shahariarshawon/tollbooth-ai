# AI Provider Architecture

The gateway is **provider-agnostic**. Clients call one OpenAI-compatible endpoint; behind it the gateway
routes each request to an AI provider through a common interface. Gemini is the active provider, and
OpenAI and Anthropic are implemented and tested but switched off.

```
Client
  |   POST /v1/chat/completions     (OpenAI-compatible request and response)
  v
Tollbooth gateway
  |   API key -> rate limit -> budget -> validation
  v
AI provider router                  picks the provider for the requested model
  |
  +--> Gemini provider     ACTIVE
  +--> OpenAI provider     ready, switched off
  +--> Anthropic provider  ready, switched off
```

Nothing after the router knows which provider it is talking to. The pipeline calls the router, then the
provider interface, then records the result; the traffic controls (rate limits, token quota, budget,
circuit breaker) work on provider ids and prices, never on a provider's name.

## The `AIProvider` interface

Every provider implements this (`apps/gateway/src/providers/provider.interface.ts`):

| Member                            | Purpose                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                              | `gemini`, `openai` or `anthropic`. Used in logs and in the circuit breaker key.                                                                                                                              |
| `type`                            | The matching value of the database `ProviderType` enum (`GOOGLE`, `OPENAI`, `ANTHROPIC`).                                                                                                                    |
| `isConfigured()`                  | True when the provider has an API key.                                                                                                                                                                       |
| `getProviderName()`               | Human-readable name (`Google Gemini`, `OpenAI`, `Anthropic`), for logs and the dashboard. `id` is the stable key used in code; this is its display name.                                                     |
| `chatCompletion(request)`         | Sends the conversation and returns a neutral result. Throws a classified `ProviderError`. Retries a timeout or a provider rate limit itself (see [provider-router.md](provider-router.md)) before giving up. |
| `streamCompletion(request)`       | Not implemented: every provider rejects it with the same classified error, since streaming does not exist yet.                                                                                               |
| `getModelInfo(model)`             | Context window and maximum output of a model it knows, or `undefined`.                                                                                                                                       |
| `validateModel(model)`            | True when the provider recognises the model by itself (backed by the same table as `getModelInfo`), independent of the database catalogue the router actually checks.                                        |
| `calculateUsage(request, result)` | Final token counts: what the provider reported (Gemini counts reasoning tokens as output), or an estimate.                                                                                                   |

`ProviderError` has a `kind`, so no code outside a provider ever parses a provider error:

| Kind           | Meaning                                                             | Caller sees                     | Circuit breaker   |
| -------------- | ------------------------------------------------------------------- | ------------------------------- | ----------------- |
| `bad_request`  | The provider refused the request itself (bad value, blocked prompt) | `400 provider_rejected_request` | counts as healthy |
| `auth`         | Our own credentials were rejected                                   | `503 provider_unavailable`      | failure           |
| `rate_limited` | The provider rate limit was reached                                 | `503 provider_unavailable`      | failure           |
| `timeout`      | The provider did not answer in time                                 | `503 provider_unavailable`      | failure           |
| `unavailable`  | Outage, 5xx, or the model is missing at the provider                | `503 provider_unavailable`      | failure           |

Provider error text is never forwarded for `auth`, `rate_limited`, `timeout` and `unavailable`: real providers
echo part of the API key in some errors.

## The router

`ProviderRouter.resolve(model)` (`provider.router.ts`):

1. The model must exist in `ai_models`, otherwise `400 model_not_found`.
2. It must be active (`isActive`), otherwise `400 model_unavailable`.
3. Its provider must be `ACTIVE` in `ai_providers`, implemented in the gateway, and have an API key.
   Otherwise `503 provider_unavailable`.
4. When several providers offer the same model name, `GATEWAY_DEFAULT_PROVIDER` (default `gemini`) goes first.

It returns the provider, its id, the model prices, the pricing tier and the model limits. If the model
limits are known, the gateway refuses a `max_tokens` above the model output limit and a conversation longer
than its context window without calling the provider.

At startup the router logs a warning (`default_provider_not_configured`) if the default provider has no
API key. The gateway still starts: no provider is mandatory.

## Providers

| Provider  | Class               | API                                               | Key variable        | Default state |
| --------- | ------------------- | ------------------------------------------------- | ------------------- | ------------- |
| Gemini    | `GeminiProvider`    | Google AI Studio `models/{model}:generateContent` | `GOOGLE_AI_API_KEY` | **ACTIVE**    |
| OpenAI    | `OpenAIProvider`    | Chat Completions, through the `openai` SDK        | `OPENAI_API_KEY`    | DISABLED      |
| Anthropic | `AnthropicProvider` | Messages API `/v1/messages`                       | `ANTHROPIC_API_KEY` | DISABLED      |

**Gemini** translates system messages into `systemInstruction`, the assistant role into `model`, and the
OpenAI parameters into `generationConfig`. The key goes in the `x-goog-api-key` header, never the URL. A reply
stopped by a safety filter returns `content: null` with `finish_reason: "content_filter"`; a prompt blocked by
Gemini is a `400`. Google reports an invalid key as a 400, which the adapter recognises and treats as our
credentials failing (a `503`, not the caller's mistake).

**Anthropic** requires `max_tokens`, so requests without one get 1024. Parameters it does not have
(`presence_penalty`, `frequency_penalty`, `user`) are left out, temperature is capped at 1 (its range is 0 to
1), and `top_p` is dropped when a temperature is set because newer Claude models refuse both.

**OpenAI** is the original adapter, unchanged apart from the extended interface. The `openai` package is a
dependency, but nothing runs it unless the provider is activated and `OPENAI_API_KEY` is set.

### Switching a provider on or off

The state lives in the database, not in code. A provider serves traffic when its row is `ACTIVE` **and** its
key is configured:

```sql
UPDATE ai_providers SET status = 'ACTIVE' WHERE name = 'OpenAI';    -- switch on
UPDATE ai_providers SET status = 'DISABLED' WHERE name = 'OpenAI';  -- switch off
```

The router reads the row on every request, so no restart is needed. (There is no `INACTIVE` status; the
existing `DISABLED` value is used so the schema did not change.) `pnpm db:seed` sets Gemini `ACTIVE` and the
others `DISABLED`.

## Cost and usage tracking

Provider independent, and driven by data:

- **Tokens** come from `calculateUsage`, in one shape for every provider.
- **Prices** are rows in `ai_models` (USD per 1,000,000 tokens). No price is written in code, so changing a price
  or adding a model needs no deploy.
- **Cost** of a call = input tokens x input price + output tokens x output price, rounded up to a micro-dollar,
  by one function for every provider (`budget/cost-estimator.ts`). It is stored as `ai_requests.estimatedCost` and
  drives the budget counters. It is an estimate for governance, not an invoice: there is no ledger entry here.
- Each request row records `provider`, `model`, `requestTokens`, `responseTokens`, `totalTokens`, `latencyMs`,
  `estimatedCost` and `status`.

### Free and paid tiers

A provider account is either on a free tier (costs nothing) or a paid tier. It is stored in the provider row:

```json
{ "tier": "free" }
```

| Tier   | Effect                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| `free` | Cost is 0: nothing is charged against the tenant budget and `estimatedCost` is 0. Tokens are still counted. |
| `paid` | Cost is computed from the model prices.                                                                     |

The model prices stay on record while on the free tier, so moving to a paid plan means changing one field:

```sql
UPDATE ai_providers SET configuration = '{"tier": "paid"}' WHERE name = 'Google Gemini';
```

The seed marks Gemini `free` (a fresh Google AI Studio key is on the free plan) and the others `paid`; re-seeding
never overwrites a tier you chose. Seeded prices are Gemini paid-tier list prices for development: check them
against Google's current price list before relying on them for money.

## Redis layer

Unchanged, except the circuit breaker is keyed by provider id:

```
provider:gemini:circuit
provider:openai:circuit
provider:anthropic:circuit
```

Each provider has its own breaker, so an outage at one does not stop traffic to another. Rate limits, token
quotas and budgets are per tenant and API key and do not depend on the provider.

## Adding a provider

1. Implement `AIProvider` (copy `gemini.provider.ts`; keep request and response translation in a pure
   `*.mapper.ts` so it can be unit tested without a network).
2. Add its id to `ProviderId` and its type to the database `ProviderType` enum if it is new.
3. Add its known models to `providers/model-info.ts`.
4. Register it in `providers.module.ts`.
5. Insert an `ai_providers` row and `ai_models` rows (prices) with `prisma/seed.ts`.
6. Add a fake of its API under `test/support/` and a block in `test/providers.e2e-spec.ts`. The shared
   `provider-contract.spec.ts` checks the interface for you once the provider is added to its list.

## Retries and timeouts

See [provider-router.md](provider-router.md) for the full retry and timeout design (Phase 6). In short:
every provider call has a timeout (`GATEWAY_PROVIDER_TIMEOUT_MS`), and a timeout or a provider rate limit is
retried up to `GATEWAY_MAX_PROVIDER_RETRIES` times with a short backoff; a bad request, bad credentials, or
an outage (`unavailable`, the circuit breaker's job) are never retried.

## What is not done

- **Failover.** The router picks one provider; trying the next when a call fails is a later feature (the circuit
  breaker already stops traffic to a failing provider).
- **Streaming**, embeddings and other endpoints.
- **Token counting for Gemini and Claude** before the call uses an OpenAI vocabulary, which is only an
  approximation for them. It is used for the admission estimate and the fallback; the provider-reported usage
  replaces it on every successful call.
- **Model aliases.** A client must ask for a model that is in the catalogue (`gemini-2.0-flash`). An OpenAI
  client with a hard-coded `gpt-4` gets `503` while OpenAI is switched off.
- **Real API verification.** The adapters are tested against local fakes that speak each provider wire format,
  not against the live services.
