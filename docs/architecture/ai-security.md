# AI Security Service (Phase 9)

A Python/FastAPI service (`apps/ai-service`) that checks a request's content before the gateway sends it
to a provider, plus a Redis-backed cache foundation for a future one.

```
User Request
    |
    v
Gateway            API key -> rate limit -> budget check
    |
    v
AI Security Service     POST /security/check  { "text": "..." }
    |                    -> PII, prompt injection, content filter
    v
AI Provider Router       (unchanged: provider-router.md)
    |
    v
Response
```

## 1. The service (`apps/ai-service/app/`)

```
app/
├── main.py                 FastAPI app: /health, /security/check, /security/cache[/lookup]
└── security/
    ├── models.py           Pydantic request/response shapes
    ├── pii.py               find_pii(text) -> list[PiiMatch]
    ├── prompt_guard.py      find_prompt_injection(text), find_content_violations(text)
    └── cache.py             CacheService: Redis-backed, hash(prompt) -> response
```

(The task sketch names this `src/`; the existing scaffold's package is already called `app/` — created in
Phase 0, already wired into `pytest`, `ruff` and CI — so the new code was added there instead of
introducing a second, parallel layout for the same app.)

## 2. PII detection (Task 2)

`POST /security/check` — one endpoint covers PII, prompt injection and the content filter in one round
trip (see §4), but this section covers the PII half:

```json
// request
{ "text": "Email me at jane.doe@example.com" }
// response
{ "blocked": true, "safe": true, "issues": [{ "type": "email", "preview": "ja****************om" }] }
```

Regex plus a Luhn checksum for credit cards, not a trained model — deliberately simple, and good enough to
prove the pipeline end to end:

| Type              | How                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `email`           | A standard email regex.                                                                                                           |
| `phone_number`    | A loose "looks like a phone number" pattern (separators, 7+ digits) — not a per-country validator.                                |
| `passport_number` | One or two letters followed by 6-9 digits — a heuristic covering many real formats, not exhaustive.                               |
| `credit_card`     | A 13-19 digit candidate, confirmed with the Luhn checksum, so an arbitrary long number (or a phone number) is not flagged as one. |

**The raw match never leaves `pii.py`.** Every issue carries a masked `preview` (first two and last two
characters, `*` between) instead of the value that triggered it — the check's own response must not become
a second place the PII leaks to, whether that's a log line or a client that echoes the response back.

## 3. Prompt injection detection (Task 3)

`find_prompt_injection(text)` matches a short list of common jailbreak/injection phrasings (case
insensitive): "ignore previous instructions", "system prompt", "reveal secrets", "you are now", "DAN
mode", and a few more (see `prompt_guard.py` for the full list). `safe` in the response is specifically
this check: `true` only when nothing on that list matched.

## 4. Content filter (Task 4)

`find_content_violations(text)` is the same kind of list, for requests asking for help with something
dangerous or clearly malicious (building a weapon, writing malware). Kept simple on purpose, as asked: a
phrase list, not a classifier.

**One endpoint, one response.** `/security/check` runs all three (PII, injection, content filter) and
returns one combined result:

```json
{ "blocked": bool, "safe": bool, "issues": [{ "type": "...", "preview": "..." }, ...] }
```

`blocked` is true if `issues` is non-empty (anything found, PII included); `safe` is specifically "no
prompt injection" (Task 3's own question). The gateway only needs `blocked` to decide; `issues` is for
logging and a future UI.

## 5. Semantic cache foundation (Task 5)

An **exact-match** cache today: `make_cache_key(prompt)` is `hash(prompt)` (SHA-256), so two identical
prompts share an entry. "Semantic" (two _differently worded_ prompts matching) needs embeddings — which is
exactly why the tech stack lists "PostgreSQL pgVector preparation": once prompts are embedded and stored in
pgvector, this service could look up the nearest stored embedding instead of hashing the exact text. That
is future work; `CacheService` (`get`/`set`, backed by Redis — the same `REDIS_URL` the rest of the
platform already uses) is the interface it would sit behind.

```
POST /security/cache          { "prompt": "...", "response": "...", "ttl_seconds": 3600 } -> { "cached": true, "key": "ai_cache:..." }
POST /security/cache/lookup   { "prompt": "..." } -> { "hit": true, "response": "..." }
```

**Not wired into the gateway's hot path yet** — Task 6's flow does not mention it, so it is exposed and
tested on its own, ready for a later phase to call before the provider router (skip the call entirely on a
hit) and after it (store the reply).

## 6. Gateway integration (Task 6)

```
Request -> API Key Check -> Rate Limit -> Budget Check -> AI Security Check -> Provider Router -> Response
```

`SecurityGuard` (`apps/gateway/src/security/`) is the fourth guard on `POST /v1/chat/completions`, right
after `BudgetGuard`:

```ts
@UseGuards(ApiKeyGuard, RateLimitGuard, BudgetGuard, SecurityGuard)
```

It runs as a guard — reading `request.body` directly, the same way `BudgetGuard` reads headers — rather
than inside `GatewayService`, so a blocked or malicious request never reaches provider-routing or admission
at all. Guards run before NestJS's validation pipe has turned the body into a `ChatCompletionRequestDto`,
so the guard is deliberately tolerant of a body that is not shaped like a chat completion yet (no
`messages`, or no string `content`): it allows the request through, and DTO validation rejects it properly,
with its own clearer error, right after.

`SecurityService.check(text)` sends every message's `content`, joined, to `AI_SERVICE_URL`'s
`/security/check`:

| Outcome                                                                          | Gateway response                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Nothing to check (no message content yet)                                        | Allowed; DTO validation handles it next                                                    |
| `blocked: false`                                                                 | Allowed, request proceeds to the provider router                                           |
| `blocked: true`                                                                  | `400 content_policy_violation` — never reaches a provider, never recorded in `ai_requests` |
| Service unreachable or errors, **fail closed (default)**                         | `503 security_service_unavailable`                                                         |
| Service unreachable or errors, **fail open** (`GATEWAY_SECURITY_FAIL_OPEN=true`) | Allowed, unchecked                                                                         |

The fail-open/fail-closed choice mirrors `GATEWAY_FAIL_OPEN`, which already makes the same choice for
Redis being unreachable: false (the default, here and there) favors correctness — a provider never sees
content that was not actually checked — over availability.

## 7. Configuration (Task 7)

| Variable                      | Default                 | Meaning                                                              |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `AI_SERVICE_URL`              | `http://localhost:8000` | Base URL of the AI Security Service.                                 |
| `GATEWAY_SECURITY_TIMEOUT_MS` | `3000`                  | How long the gateway waits for one `/security/check` call.           |
| `GATEWAY_SECURITY_FAIL_OPEN`  | `false`                 | What happens if the service cannot be reached (see the table above). |

## 8. Local development (quality check: "FastAPI service runs")

```bash
cd apps/ai-service
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

It needs nothing else to start; the cache endpoints need the platform's own Redis (`REDIS_URL`, default
`redis://localhost:6379`) reachable, same as `pnpm infra:up` already provides. Verified locally this phase:
the service starts, and a real gateway pointed at it (`AI_SERVICE_URL=http://localhost:8000`) blocked a
PII-bearing prompt with `400 content_policy_violation` and let a clean one through to the (fake) provider.

## 9. Testing (Task 8)

- **`apps/ai-service/tests/`** (pytest, run by CI's `ai-service` job): PII detected (email, phone,
  passport, credit card, including a Luhn-invalid number correctly _not_ flagged); a safe prompt is
  allowed; an injection phrase is blocked; the content filter blocks a dangerous request and allows an
  ordinary one; the cache stores and returns a response (`fakeredis`, so CI needs no Redis for this job —
  the project's Node side uses a real Redis in tests instead, since Python's CI job had none before this
  phase and adding one was out of this phase's scope).
- **`apps/gateway/src/security/*.spec.ts`** (unit, mocked `fetch`): a successful check's result is passed
  through; the text and URL sent are correct; an unreachable service fails closed (503) or open per
  config; `SecurityGuard` extracts and joins message content correctly, allows a clean result, blocks with
  `400 content_policy_violation`, and tolerates a body with no checkable content.
- **`apps/gateway/test/security.e2e-spec.ts`** (real gateway, Postgres, Redis; a local fake security
  service — see below): the joined text actually reaches the service; a block answers 400 and never calls
  the provider or writes an `ai_requests` row; an unreachable/erroring/slow service answers 503 by default,
  or lets the request through when `GATEWAY_SECURITY_FAIL_OPEN=true`.
- **Fake AI Security Service** (`apps/gateway/test/support/fake-security.ts`): defaults to "nothing
  found", so every other gateway e2e test (all ~200 of them) is unaffected by this guard existing — none of
  them touch it. This mirrors the fake Gemini/OpenAI/Anthropic servers from earlier phases.
- **Regression:** the full gateway and control-plane suites were re-run (unit and e2e) and pass unchanged.

## What is not done

- A real NER model or vendor moderation API — the detectors are regex/keyword lists, by design (Task 4:
  "keep implementation simple").
- The cache is not called from the gateway's request path yet (§5).
- True semantic (embedding-similarity) cache lookups — needs pgvector-stored embeddings (§5).
- Any admin surface for reviewing blocked requests or tuning the pattern lists.
