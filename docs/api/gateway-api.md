# Gateway API

The gateway (`apps/gateway`) is an OpenAI-compatible front door for AI models. A developer swaps the base
URL and API key in an existing OpenAI client and keeps the rest of their code. Behind it, a provider router sends
each request to an AI provider: **Gemini is the active provider**, and OpenAI and Anthropic are implemented and
ready to switch on. See [provider-architecture.md](../architecture/provider-architecture.md).

| Setting  | OpenAI                      | Tollbooth AI                           |
| -------- | --------------------------- | -------------------------------------- |
| Base URL | `https://api.openai.com/v1` | `http://localhost:3000/v1` (your host) |
| API key  | `sk-...`                    | `tb_...` (a key from your project)     |

## Endpoint

### `POST /v1/chat/completions`

Sends a chat conversation to a model and returns the completion.

**Headers**

| Header                           | Required | Notes                                                                       |
| -------------------------------- | -------- | --------------------------------------------------------------------------- |
| `Authorization: Bearer tb_...`   | yes      | Your API key                                                                |
| `Content-Type: application/json` | yes      |                                                                             |
| `X-Request-ID`                   | no       | Your own trace id (8-64 of `A-Z a-z 0-9 . _ -`); otherwise one is generated |

The response always carries an `X-Request-ID` header. Quote it when reporting a problem.

**Request body**

| Field                | Type                          | Notes                                                    |
| -------------------- | ----------------------------- | -------------------------------------------------------- |
| `model`              | string, required              | A model in the catalogue, for example `gemini-2.0-flash` |
| `messages`           | array, required               | 1 to 500 items of `{ role, content, name? }`             |
| `messages[].role`    | `system`, `user`, `assistant` |                                                          |
| `messages[].content` | string                        | Plain text, up to 200,000 characters                     |
| `temperature`        | number 0 to 2                 | optional                                                 |
| `top_p`              | number 0 to 1                 | optional                                                 |
| `max_tokens`         | integer >= 1                  | optional; at most `GATEWAY_MAX_TOKENS` (default 4096)    |
| `stop`               | string or string[]            | optional; up to 4 sequences                              |
| `presence_penalty`   | number -2 to 2                | optional                                                 |
| `frequency_penalty`  | number -2 to 2                | optional                                                 |
| `n`                  | integer, only `1`             | optional                                                 |
| `user`               | string                        | optional end-user identifier, passed to the provider     |
| `stream`             | boolean                       | `true` is not supported yet and is rejected              |

The body is limited to 1 MB. **Parameters not listed here are rejected** with `unknown_parameter` rather than
silently ignored, so a client that sends `tools` or `response_format` learns immediately that they are not
supported.

**Example request**

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $TOLLBOOTH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [{ "role": "user", "content": "Hello" }],
    "temperature": 0.7
  }'
```

**Example response** (`200 OK`)

```json
{
  "id": "chatcmpl-9xY2...",
  "object": "chat.completion",
  "created": 1790000000,
  "model": "gemini-2.0-flash-001",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello! How can I help you today?" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 9, "completion_tokens": 9, "total_tokens": 18 }
}
```

`usage` is what the provider reported. If a provider reports none, the gateway counts tokens itself with the
OpenAI tokenizer.

### Using an OpenAI SDK

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.TOLLBOOTH_API_KEY, // tb_...
  baseURL: 'http://localhost:3000/v1',
});

const reply = await client.chat.completions.create({
  model: 'gemini-2.0-flash',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

```python
from openai import OpenAI

client = OpenAI(api_key="tb_...", base_url="http://localhost:3000/v1")
client.chat.completions.create(model="gemini-2.0-flash", messages=[{"role": "user", "content": "Hello"}])
```

Errors arrive as the SDK's own exceptions (`BadRequestError`, `AuthenticationError`, and so on).

### `GET /health`

No authentication. Returns `{ "status": "ok", "service": "gateway", "uptimeSeconds": 12 }`.

### `GET /health/redis`

No authentication. `200 {"status":"healthy","latency":"1ms"}`, or `503 {"status":"unhealthy","error":"Redis is not reachable"}`.

## Authentication

Every `/v1` request needs `Authorization: Bearer tb_<secret>`.

1. The key is hashed with SHA-256 and the hash is looked up in `api_keys`. The raw key is never stored,
   compared or logged.
2. The key must be `ACTIVE` and not expired. The key's tenant and project must both be `ACTIVE`.
3. The tenant and project are taken from the key. There is no way to name a different tenant in a request.
4. The key must hold the permission for the endpoint: `chat:completions` here.

Unknown, revoked and expired keys all return the same `401 Invalid API key`, so a response does not reveal
whether a key ever existed. A valid key whose tenant is suspended or whose project is archived returns `403`.

## Request pipeline

```
Request
  1. request id            X-Request-ID generated (or accepted if safe)
  2. API key validation    hash, look up, check status and expiry
  3. tenant identification tenant, project and plan read from the key
  4. permission check      key must hold chat:completions
  5. rate limit            requests per minute for the tenant and for the key   -> 429   (Redis)
  6. budget pre-check      has the tenant already used its whole month?         -> 402   (Redis)
  7. request validation    DTO rules, unknown fields rejected, max_tokens ceiling, stream refused
  8. model validation      model exists and is active in the catalogue
  9. provider routing      provider enabled in the database, implemented and configured
 10. token quota           reserve estimated tokens per minute                  -> 429   (Redis)
 11. budget reservation    hold the worst-case cost of this request             -> 402   (Redis)
 12. circuit breaker       is the provider healthy?                             -> 503   (Redis)
 13. provider call         the provider adapter (Gemini), normalised to a provider-neutral result
 14. update counters       settle tokens and budget to real usage, update the circuit
 15. save request record   ai_requests row: tenant, project, key, provider, model, tokens, latency, status
 16. respond               OpenAI-shaped JSON
```

Steps 5 to 6 and 10 to 12 are the traffic controls, described in
[docs/architecture/redis-layer.md](../architecture/redis-layer.md). A request refused at any of them never
reaches the provider, and whatever an earlier control took (tokens, budget) is handed back.

Every call that reaches a provider is recorded in `ai_requests`, whether it succeeded (`SUCCESS`) or not
(`FAILED`, with a short reason such as `timeout`, `auth` or `rate_limited`). Requests rejected before a
provider call (bad key, limits, invalid body, unknown model, open circuit) are not recorded. `latencyMs` covers
the gateway's work up to the provider's answer. `estimatedCost` is left at 0 until billing exists.

## Rate limits and budgets

Limits depend on the tenant plan (see the table in the Redis layer document); a key's own `rateLimit` overrides
the per-key request limit. Every response to an authenticated request carries:

| Header                           | Meaning                                                      |
| -------------------------------- | ------------------------------------------------------------ |
| `X-RateLimit-Limit-Requests`     | the requests-per-minute limit that is closest to running out |
| `X-RateLimit-Remaining-Requests` | requests left this minute                                    |
| `X-RateLimit-Reset-Requests`     | time until the window resets, for example `47s`              |

A `429` adds `Retry-After` (seconds), and a token-quota `429` adds `X-RateLimit-Limit-Tokens`. A circuit-open
`503` adds `Retry-After` too. Token quotas count the prompt plus the most the request may generate
(`max_tokens`, or 1024 when unset), so a large `max_tokens` uses up quota even if the answer is short; the
counters are corrected to real usage once the call finishes.

## Errors

Every error has the same shape, the one OpenAI clients already parse:

```json
{
  "error": {
    "message": "Invalid API key",
    "type": "authentication_error",
    "param": null,
    "code": "invalid_api_key"
  }
}
```

| HTTP | `code`                      | `type`                  | When                                                                 |
| ---- | --------------------------- | ----------------------- | -------------------------------------------------------------------- |
| 401  | `missing_api_key`           | `authentication_error`  | No `Authorization` header                                            |
| 401  | `invalid_api_key`           | `authentication_error`  | Malformed, unknown, revoked or expired key                           |
| 403  | `account_inactive`          | `permission_error`      | The key's tenant is not active or its project is archived            |
| 403  | `insufficient_permissions`  | `permission_error`      | The key lacks `chat:completions`                                     |
| 400  | `invalid_request`           | `invalid_request_error` | A field is missing or out of range (`param` names it)                |
| 400  | `unknown_parameter`         | `invalid_request_error` | A field the gateway does not support                                 |
| 400  | `invalid_json`              | `invalid_request_error` | The body is not valid JSON                                           |
| 400  | `max_tokens_exceeded`       | `invalid_request_error` | `max_tokens` is above the gateway ceiling                            |
| 400  | `streaming_not_supported`   | `invalid_request_error` | `stream: true`                                                       |
| 400  | `model_not_found`           | `invalid_request_error` | The model is not in the catalogue                                    |
| 400  | `model_unavailable`         | `invalid_request_error` | The model exists but is switched off                                 |
| 400  | `provider_rejected_request` | `invalid_request_error` | The provider refused the request itself (for example a bad value)    |
| 404  | `not_found`                 | `invalid_request_error` | Unknown route                                                        |
| 413  | `request_too_large`         | `invalid_request_error` | Body over 1 MB                                                       |
| 503  | `provider_unavailable`      | `api_error`             | The provider is down, rate limited, slow, disabled or not configured |
| 500  | `internal_error`            | `server_error`          | Unexpected failure on the gateway                                    |

What errors never contain: stack traces, database errors, the gateway's provider credentials, or provider
error text. Provider failures are reduced to `provider_unavailable`; the only provider wording passed on is
for `provider_rejected_request`, which describes the caller's own input.

## Logging

Each request writes one JSON line to stdout when it finishes, including rejected ones:

```json
{
  "time": "2026-10-01T10:00:00.000Z",
  "level": "info",
  "requestId": "req_4f1c...",
  "method": "POST",
  "path": "/v1/chat/completions",
  "statusCode": 200,
  "tenantId": "9e3c...",
  "projectId": "c4c5...",
  "model": "gemini-2.0-flash",
  "latency": 812
}
```

`latency` is milliseconds for the whole request. Prompts, completions and keys are never logged.

The traffic controls also log an event when they act (`level: warn`), for example:

```json
{"timestamp":"2026-10-01T10:00:01.000Z","level":"warn","event":"rate_limit_blocked","requestId":"req_4f1c...","tenantId":"9e3c...","apiKeyId":"3eef...","scope":"key","limit":20,"window":"1m"}
{"timestamp":"2026-10-01T10:00:02.000Z","level":"warn","event":"budget_blocked","requestId":"req_77aa...","tenantId":"9e3c...","requested":617,"remaining":1,"monthlyLimit":100000000,"unit":"micro_usd"}
```

Others: `token_quota_blocked`, `circuit_state_changed`, `circuit_open_rejected`, `circuit_trial_request`,
`redis_ready`, `redis_error`, `traffic_control_redis_failure`.

## Configuration

| Variable                                  | Default                                            | Notes                                                                                   |
| ----------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GOOGLE_AI_API_KEY`                       | none                                               | Gemini, the active provider. Without it Gemini models answer `503 provider_unavailable` |
| `GOOGLE_AI_BASE_URL`                      | `https://generativelanguage.googleapis.com/v1beta` | Gemini endpoint                                                                         |
| `GATEWAY_DEFAULT_PROVIDER`                | `gemini`                                           | Which provider serves a model offered by several active ones                            |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`       | none, `https://api.openai.com/v1`                  | Optional. OpenAI is ready but switched off by default                                   |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` | none, `https://api.anthropic.com`                  | Optional. Anthropic is ready but switched off by default                                |
| `GATEWAY_PORT`                            | falls back to `PORT`                               |                                                                                         |
| `GATEWAY_MAX_TOKENS`                      | `4096`                                             | Ceiling for a request's `max_tokens`                                                    |
| `GATEWAY_PROVIDER_TIMEOUT_MS`             | `60000`                                            | After this the call fails as `provider_unavailable`                                     |
| `DATABASE_URL`                            | none                                               | Required                                                                                |

Models come from the `ai_models` table. The seed has `gemini-2.0-flash`, `gemini-2.0-flash-lite`,
`gemini-2.5-flash` and `gemini-2.5-pro` (Gemini, active), plus `gpt-4`, `gpt-4o`, `gpt-4o-mini` (OpenAI) and
`claude-sonnet-4-5` (Anthropic), which answer `503 provider_unavailable` until their provider is switched on.
A model is served only when it is active and its provider is `ACTIVE` in `ai_providers`, implemented, and
configured with a key. The gateway also refuses, without calling the provider, a `max_tokens` above what the
model can produce (`max_tokens_exceeded`) and a conversation longer than its context window
(`context_length_exceeded`), for the models it knows the limits of.

## Trying it locally

```bash
pnpm infra:up && pnpm db:migrate && pnpm db:seed
GOOGLE_AI_API_KEY=... pnpm --filter @tollbooth/gateway dev      # http://localhost:3000
pnpm gateway:test                                               # sends a request and shows the result
```

(or put `GOOGLE_AI_API_KEY` in `.env`; a free key is available from Google AI Studio.) `pnpm gateway:test` issues a
short-lived development key for the seeded project (or uses `TOLLBOOTH_API_KEY`), prints the reply, token counts
and latency, shows the saved request record, and checks that a bad key and an unknown model are refused. To run
without a Google account, start the bundled fake Gemini:

```bash
pnpm exec tsx apps/gateway/test/support/fake-gemini.ts 4020
GOOGLE_AI_API_KEY=AIza-test-key-not-real GOOGLE_AI_BASE_URL=http://127.0.0.1:4020/v1beta pnpm --filter @tollbooth/gateway dev
```

## Not included yet

Streaming responses, other endpoints (`/v1/models`, embeddings), provider failover, billing (the cost stored
with each request is an estimate, there is no ledger), usage events and content scanning. The request and provider abstractions
are shaped so each can be added without changing the endpoint.
