# Gateway API

The gateway (`apps/gateway`) is an OpenAI-compatible front door for AI models. A developer swaps the base
URL and API key in an existing OpenAI client and keeps the rest of their code.

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

| Field                | Type                          | Notes                                                 |
| -------------------- | ----------------------------- | ----------------------------------------------------- |
| `model`              | string, required              | A model in the catalogue, for example `gpt-4`         |
| `messages`           | array, required               | 1 to 500 items of `{ role, content, name? }`          |
| `messages[].role`    | `system`, `user`, `assistant` |                                                       |
| `messages[].content` | string                        | Plain text, up to 200,000 characters                  |
| `temperature`        | number 0 to 2                 | optional                                              |
| `top_p`              | number 0 to 1                 | optional                                              |
| `max_tokens`         | integer >= 1                  | optional; at most `GATEWAY_MAX_TOKENS` (default 4096) |
| `stop`               | string or string[]            | optional; up to 4 sequences                           |
| `presence_penalty`   | number -2 to 2                | optional                                              |
| `frequency_penalty`  | number -2 to 2                | optional                                              |
| `n`                  | integer, only `1`             | optional                                              |
| `user`               | string                        | optional end-user identifier, passed to the provider  |
| `stream`             | boolean                       | `true` is not supported yet and is rejected           |

The body is limited to 1 MB. **Parameters not listed here are rejected** with `unknown_parameter` rather than
silently ignored, so a client that sends `tools` or `response_format` learns immediately that they are not
supported.

**Example request**

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $TOLLBOOTH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
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
  "model": "gpt-4-0613",
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
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

```python
from openai import OpenAI

client = OpenAI(api_key="tb_...", base_url="http://localhost:3000/v1")
client.chat.completions.create(model="gpt-4", messages=[{"role": "user", "content": "Hello"}])
```

Errors arrive as the SDK's own exceptions (`BadRequestError`, `AuthenticationError`, and so on).

### `GET /health`

No authentication. Returns `{ "status": "ok", "service": "gateway", "uptimeSeconds": 12 }`.

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
  3. tenant identification tenant and project read from the key
  4. permission check      key must hold chat:completions
  5. request validation    DTO rules, unknown fields rejected, max_tokens ceiling, stream refused
  6. model validation      model exists and is active in the catalogue
  7. provider selection    provider enabled, implemented and configured
  8. provider call         OpenAI SDK, normalised to a provider-neutral result
  9. save request record   ai_requests row: tenant, project, key, provider, model, tokens, latency, status
 10. respond               OpenAI-shaped JSON
```

Every call that reaches a provider is recorded in `ai_requests`, whether it succeeded (`SUCCESS`) or not
(`FAILED`, with a short reason such as `timeout`, `auth` or `rate_limited`). Requests rejected before a
provider is chosen (bad key, invalid body, unknown model) are not recorded. `latencyMs` covers the gateway's
work up to the provider's answer. `estimatedCost` is left at 0 until billing exists.

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
  "model": "gpt-4",
  "latency": 812
}
```

`latency` is milliseconds for the whole request. Prompts, completions and keys are never logged.

## Configuration

| Variable                      | Default                     | Notes                                                      |
| ----------------------------- | --------------------------- | ---------------------------------------------------------- |
| `OPENAI_API_KEY`              | none                        | Without it OpenAI models answer `503 provider_unavailable` |
| `OPENAI_BASE_URL`             | `https://api.openai.com/v1` | Any OpenAI-compatible server                               |
| `GATEWAY_PORT`                | falls back to `PORT`        |                                                            |
| `GATEWAY_MAX_TOKENS`          | `4096`                      | Ceiling for a request's `max_tokens`                       |
| `GATEWAY_PROVIDER_TIMEOUT_MS` | `60000`                     | After this the call fails as `provider_unavailable`        |
| `DATABASE_URL`                | none                        | Required                                                   |

Models come from the `ai_models` table (seed: `gpt-4`, `gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4-5`). A model
is served only when it is active and its provider is enabled, implemented and configured. `claude-sonnet-4-5`
exists in the catalogue but has no provider implementation yet, so it answers `503`.

## Trying it locally

```bash
pnpm infra:up && pnpm db:migrate && pnpm db:seed
OPENAI_API_KEY=sk-... pnpm --filter @tollbooth/gateway dev      # http://localhost:3000
pnpm gateway:test                                               # sends a request and shows the result
```

`pnpm gateway:test` issues a short-lived development key for the seeded project (or uses
`TOLLBOOTH_API_KEY`), prints the reply, token counts and latency, shows the saved request record, and checks
that a bad key and an unknown model are refused. To run without an OpenAI account, start the bundled fake:

```bash
pnpm exec tsx apps/gateway/test/support/fake-openai.ts 4010
OPENAI_API_KEY=any OPENAI_BASE_URL=http://127.0.0.1:4010/v1 pnpm --filter @tollbooth/gateway dev
```

## Not included yet

Streaming responses, other endpoints (`/v1/models`, embeddings), other providers, rate limiting, budgets,
provider failover, cost calculation, usage events and content scanning. The request and provider abstractions
are shaped so each can be added without changing the endpoint.
