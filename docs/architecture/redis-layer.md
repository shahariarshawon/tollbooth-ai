# Redis Layer

The gateway uses Redis to decide, in under a millisecond and before an AI provider is called, whether a
request may go ahead: within its rate limit, within its token quota, within the tenant's monthly budget,
and to a provider that is healthy.

Redis holds **fast, shared, disposable state**. The record of what happened is still PostgreSQL
(`ai_requests`). If Redis were wiped, limits would restart from zero and the budget counters would need
rebuilding from the database; nothing permanent is lost.

## 1. Architecture

```
                         Gateway instance (any number of them)
 Request                 +---------------------------------------------------------------+
   |                     |  ApiKeyGuard          key -> tenant, project, plan      (Postgres)
   v                     |  RateLimitGuard       requests/min: tenant and key      (Redis)  429
 [ /v1/chat/completions ]|  BudgetGuard          month already used up?            (Redis)  402
                         |  validation, model and provider selection               (Postgres)
                         |  TrafficControlService.admit                                      |
                         |     1. token quota    reserve estimated tokens          (Redis)  429
                         |     2. budget         reserve worst-case cost           (Redis)  402
                         |     3. circuit        is the provider healthy?          (Redis)  503
                         |  provider call        OpenAI                                      |
                         |  TrafficControlService.complete / abort                           |
                         |     settle tokens and budget to real usage, update circuit (Redis)
                         |  save ai_requests row                                   (Postgres)
                         +---------------------------------------------------------------+
                                    |                        ^
                                    v                        |
                              +-----------------------------------+
                              |  Redis: counters, hashes, JSON    |   shared by all instances
                              +-----------------------------------+
```

| Piece                         | File                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| Connection, lifecycle, health | `redis/redis.service.ts`, `redis.config.ts`, `redis.module.ts`     |
| Key names and time buckets    | `redis/redis.constants.ts`                                         |
| What to do when Redis fails   | `redis/redis-failure.policy.ts`                                    |
| `GET /health/redis`           | `redis/redis-health.controller.ts`                                 |
| Limits per plan               | `traffic/plan-limits.ts`                                           |
| Atomic counter pair           | `traffic/window-counter.ts`                                        |
| Rate limiter, guard           | `traffic/rate-limiter.service.ts`, `rate-limit.guard.ts`           |
| Token quota                   | `traffic/token-quota.service.ts`                                   |
| Budget                        | `budget/budget.service.ts`, `budget.guard.ts`, `cost-estimator.ts` |
| Circuit breaker               | `circuit-breaker/circuit-breaker.service.ts`                       |
| Orchestration                 | `traffic/traffic-control.service.ts`                               |

Why only two of the controls are Nest guards: guards run before the request body is validated and before
the model is resolved. The rate limit needs only the caller, so it is a guard. The token quota and budget
need the request size, and the circuit breaker needs the provider, so they run as steps inside the pipeline,
in the order you would expect (quota, budget, breaker). `BudgetGuard` is a cheap early exit for tenants that
have already used their whole month; the exact reservation happens later.

### Connection

One ioredis client is created at startup and shared.

- **Configuration** (`.env`): either `REDIS_URL` (which may carry a password, database and `rediss://` TLS), or,
  when `REDIS_HOST` is set, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` and `REDIS_TLS`.
- **Fail fast:** the offline queue is off, so while disconnected every command fails immediately rather than
  waiting. `REDIS_COMMAND_TIMEOUT_MS` (default 1000) bounds a slow Redis.
- **Reconnect forever:** back-off from 200 ms to 3 s between attempts, and a reconnect after a failover
  (`READONLY` replies).
- **Startup:** waits up to 3 s for Redis, then carries on; the gateway never refuses to boot because Redis is
  down.
- **Logging:** connection errors are logged at most every 10 s, with the address and never the password.
- **Health:** `GET /health/redis` returns `{"status":"healthy","latency":"1ms"}`, or `503` with
  `{"status":"unhealthy","error":"Redis is not reachable"}`. It is public, like `/health`.

### When Redis is down

Limits exist to protect money and capacity, so the default is to **fail closed**: a request whose limits
cannot be checked gets `503 traffic_control_unavailable`. Setting `GATEWAY_FAIL_OPEN=true` lets requests
through unlimited instead, for deployments that prefer availability. Either way the outage is logged, and
`/health/redis` reports it. The circuit breaker is advisory, so it always fails open. A 429 or 402 from a
control is a real answer and is never swallowed by this policy.

## 2. Key naming

```
tenant:{<tenantId>}:requests:<YYYYMMDDHHmm>                     requests this minute, whole tenant
tenant:{<tenantId>}:apikey:<keyId>:requests:<YYYYMMDDHHmm>      requests this minute, one API key
tenant:{<tenantId>}:tokens:<YYYYMMDDHHmm>                       tokens this minute, whole tenant
tenant:{<tenantId>}:apikey:<keyId>:tokens:<YYYYMMDDHHmm>        tokens this minute, one API key
tenant:{<tenantId>}:budget:<YYYYMM>                             monthly budget (hash)
provider:<name>:circuit                                         circuit breaker state (JSON)
```

- **Minute and month are in the key**, in UTC. Each window is its own key, so there is nothing to reset: the old
  key expires (60 s for counters, 40 days for budgets) and a fresh one starts.
- **The braces are a Redis Cluster hash tag.** All keys of a tenant hash to one slot, which is what allows a
  single Lua script to update the tenant counter and the API key counter together on a cluster. The cost is that
  one tenant's traffic lives on one shard, which is how tenant data is partitioned anyway.
- **Time comes from the gateway**, not from Redis, so the key is a normal declared key (cluster safe) and tests
  can choose the clock. Instances should run NTP; a few hundred milliseconds of skew only moves a request
  across a window boundary.

## 3. Rate limiting algorithm

Fixed one-minute windows, counted per tenant and per API key.

```
limit for a request:
   tenant requests/min   from the tenant plan
   key requests/min      the key's own rateLimit, else the plan's per-key default

one atomic step (Lua):
   tenantUsed = GET tenant counter ; keyUsed = GET key counter
   if tenantUsed + 1 > tenantLimit  -> refuse (scope: tenant)
   if keyUsed    + 1 > keyLimit     -> refuse (scope: key)
   INCR both; set EXPIRE 60 when a counter is created
   -> allow
```

**Why a Lua script, not `INCR` then `EXPIRE`.**

1. _Races._ Redis runs a script as one uninterrupted step, so a hundred simultaneous requests are processed one
   at a time against the real counters. A test sends 100 at once against a limit of 20 and exactly 20 pass.
2. _Crashes._ With `INCR` followed by `EXPIRE`, a crash between the two leaves a counter that never expires and
   locks the caller out for good. The script creates the counter and its expiry together.
3. _Refused requests cost nothing._ With "increment, then compare", every refused request still counts, so a
   caller who keeps retrying extends its own lockout and eats quota shared with others. The script checks first
   and adds only when the request is allowed, to both counters or neither.
4. _Two counters, one decision._ The tenant and key counters are checked and updated together, so one can never
   be charged for a request the other refused.

A refusal returns `429` with `Retry-After` (seconds to the next minute) and `X-RateLimit-*` headers; allowed
requests carry the same headers with what is left.

**Token quota** uses the same counter pair with an amount instead of 1. Real token counts are only known after
the provider answers, and waiting would let a burst all pass the check. So a request first _reserves_ an
estimate (its input tokens plus its `max_tokens`, or 1024 if unset) atomically, then the counters are
_corrected_ to the real usage, or _refunded_ if the call failed. A correction to a window that has already
expired is ignored, and counters never go below zero.

**Known limit of fixed windows:** a caller can use a full limit at the end of one minute and another at the
start of the next, briefly doubling the rate. A sliding window would remove that for more Redis work per
request.

### Default limits per plan

| Plan       | Tenant req/min | Key req/min | Tenant tokens/min | Key tokens/min | Monthly budget |
| ---------- | -------------: | ----------: | ----------------: | -------------: | -------------: |
| FREE       |             60 |          20 |            40,000 |         20,000 |            $10 |
| STARTUP    |            100 |          20 |           100,000 |         50,000 |           $100 |
| BUSINESS   |            600 |         120 |         1,000,000 |        250,000 |         $1,000 |
| ENTERPRISE |          6,000 |         600 |        10,000,000 |      2,500,000 |        $10,000 |

They live in `traffic/plan-limits.ts` until they become editable per tenant (which needs columns on `tenants`).
A key's own `rateLimit` overrides the per-key request figure.

## 4. Budget control flow

Amounts are **integer micro-dollars** (1 USD = 1,000,000). Model prices are USD per million tokens, so one token
costs exactly `price` micro-dollars, and Redis arithmetic stays exact. The hash `tenant:{T}:budget:{YYYYMM}` holds:

```
monthlyLimit   the cap, refreshed from the plan on every reservation (a plan change applies at once)
currentUsage   money already spent
reserved       money held for requests still in flight
remaining      monthlyLimit - currentUsage - reserved   (kept consistent by every script)
```

```
request
  BudgetGuard        remaining <= 0 ?                      -> 402 (one cheap read, before any other work)
  ...
  reserveBudget      hold the worst case: input tokens * input price
                     + (max_tokens or 1024) * output price
                     atomic:  if amount > remaining -> 402, nothing changes
                              else reserved += amount
  provider call
  ok      -> updateUsage   reserved -= hold ; currentUsage += real cost
  failed  -> releaseBudget reserved -= hold
```

`checkBudget` answers "would this amount fit?" without holding anything. Because the hold is taken _before_ the
call, simultaneous requests cannot each see "enough left" and overspend together: a test fires 50 reservations
of $0.10 at a $1 budget and exactly 10 succeed.

`CostEstimator` turns tokens into money **only for this reservation**. It does not write `estimatedCost`, a ledger
entry or an invoice line; those belong to the billing phase.

**Limits of this foundation**

- Redis is a cache of spend, not the record. The billing phase should rebuild `currentUsage` from `ai_requests`
  after a Redis loss and reconcile periodically. Until then a wiped Redis restarts the month at zero.
- A gateway that crashes between reserving and settling leaves `reserved` inflated by that hold. Reconciliation
  fixes it; a later refinement could keep each hold as its own expiring entry.
- The monthly limit comes from the plan table. A per-tenant budget needs a column on `tenants`.

## 5. Circuit breaker lifecycle

One JSON value per provider, `provider:openai:circuit`, shared by every gateway instance:

```json
{
  "state": "OPEN",
  "failureCount": 5,
  "lastFailure": "2026-10-01T09:30:12.345Z",
  "openedAt": 1790000000000,
  "successCount": 0,
  "probing": 0
}
```

An absent key means healthy (CLOSED, no failures), so a healthy provider costs no memory.

```
        N consecutive failures                wait elapsed (30 s)
CLOSED ------------------------> OPEN ------------------------> HALF_OPEN
   ^                               ^                                 |
   |                               +-------- trial call fails --------+
   +----------- 2 trial calls succeed --------------------------------+
```

| State     | `canRequest`                            | Transitions                                                                   |
| --------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| CLOSED    | yes                                     | a failure counts; the 5th consecutive one opens the circuit                   |
| OPEN      | no (`503`, `Retry-After` = time left)   | after 30 s the next caller becomes the trial and it goes HALF_OPEN            |
| HALF_OPEN | one trial at a time; others are refused | a trial success counts (2 needed to close); a failure reopens for a full wait |

What counts: timeouts, outages, provider rate limiting, and our own credentials being rejected are **failures**.
A provider refusing the _request_ (bad parameters) means it is healthy and answering, so it counts as a success.
A success ends the run of failures, and failures more than 60 s apart do not add up. A trial that never
reports back (the gateway crashed) frees its slot after the provider timeout plus 5 s, and a late success from a
call that started before the circuit opened is ignored.

All of this runs as Lua in Redis, so two instances can never both decide they are the trial call (a test sends 25
simultaneous requests at a circuit ready for a trial and exactly one is allowed). Tested live: one instance's
failures opened the circuit and a second instance with a healthy provider also stopped sending to it.

A refused request is rejected before the provider call, hands back any tokens and budget it held, and is not
recorded as a provider failure. Open, close and trial events are logged.

`GATEWAY_CIRCUIT_FAILURE_THRESHOLD` (default 5) and `GATEWAY_CIRCUIT_OPEN_MS` (default 30000) tune it.

## 6. Scalability considerations

- **Per request:** about four Redis round trips on the hot path (rate limit, budget pre-check, then token quota,
  budget reservation and breaker check), plus about three on completion. Each is one script call of a few
  commands, so Redis time stays around a millisecond in total. The completion steps run in parallel.
- **Horizontal scaling:** gateways hold no limit state; every instance sees the same counters, so adding
  instances does not loosen or tighten limits.
- **Memory:** counters are two keys per active tenant and key per minute with a 60 s TTL, budgets are one small
  hash per tenant per month, breakers are one key per unhealthy provider. Memory tracks _active_ callers.
- **Redis Cluster:** key names carry a per-tenant hash tag and scripts only touch one tenant's keys (or one
  provider key), so they are cluster legal. A very busy single tenant concentrates load on one shard.
- **Hot keys:** the tenant counter is touched by every request of that tenant, which is fine to tens of
  thousands of requests per second per tenant on one Redis.
- **High availability:** point `REDIS_URL` or `REDIS_HOST` at a managed Redis with a replica. Failover replies
  are handled, and while Redis is unreachable the fail-closed or fail-open policy applies.
- **Persistence:** local compose runs Redis with append-only persistence. Counters are cheap to lose except the
  budget, which needs the reconciliation described above.
- **Not included yet:** a sliding window, per-tenant overrides of limits, reconciliation of budgets from the
  database, and a Redis-backed cache of API key and model lookups (every request currently reads the key and
  model from Postgres).

## Testing

```bash
pnpm --filter @tollbooth/gateway test          # unit tests: key naming, config, failure policy, plans, cost math
pnpm --filter @tollbooth/gateway test:e2e      # needs Postgres and Redis (pnpm infra:up)
```

The e2e tests use the real Redis: connection and failure, atomic limits under concurrency, token quotas, budgets,
every breaker transition, and the whole gateway with deliberately small limits, including a dead Redis with
fail-closed and fail-open.
