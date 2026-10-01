# Usage Metering, Cost Engine and Budget Enforcement (Phase 7)

How the gateway turns one AI call into tracked tokens, a provider-independent cost, a budget decision and
a permanent ledger entry. This assumes the provider abstraction in
[provider-architecture.md](provider-architecture.md) and the Redis traffic controls in
[redis-layer.md](redis-layer.md), and does not repeat them.

```
Request
  |
  v
Provider Router  --------------------------------------------->  (provider-architecture.md)
  |
  v
Provider Call                         the provider adapter, retried on a transient failure
  |
  v
Token Usage                           provider.calculateUsage(): what the provider reported, or an estimate
  |
  v
Cost Calculation                      budget/cost-estimator.ts: tokens x the model's own prices
  |
  v
Budget Validation                     TrafficControlService + BudgetService (reserve before the call,
  |                                   settle after) -- already covered by Phase 5's Redis layer
  v
Usage Ledger                          usage/usage.service.ts: ai_requests row, then a ledger_entries row
```

Steps 1-4 (router, call, token usage, cost) were already built in Phases 4-6; this phase's new work is the
usage module that files the outcome (`usage/`), the ledger (`ledger_entries`, previously unused), the
response carrying its own cost, and an optional daily budget alongside the existing monthly one.

## 1. Usage flow

`GatewayService.createChatCompletion` (`apps/gateway/src/gateway/gateway.service.ts`), after a successful
provider call:

```ts
const usage = model.provider.calculateUsage(request, result); // { requestTokens, responseTokens, totalTokens }
const costMicroUsd = await this.traffic.complete(admission, {
  inputTokens: usage.requestTokens,
  outputTokens: usage.responseTokens,
});
const estimatedCostUsd = (costMicroUsd / 1_000_000).toFixed(8);
await this.usage.recordSuccess({ auth, provider, model, latencyMs, usage, estimatedCostUsd });
return this.toResponse(result, usage, estimatedCostUsd);
```

`UsageService` (`apps/gateway/src/usage/usage.service.ts`) is the one thing the gateway calls to file the
outcome, so nothing can save the request record and forget the ledger (or the reverse). It composes two
already-existing building blocks rather than duplicating them:

- **`RequestService`** (`requests/`, since Phase 4) still owns `ai_requests`: provider, model, token counts,
  latency, status, error, and the cost. Unchanged by this phase except that `create()` now returns the new
  row's id, so the ledger entry below can link to it.
- **`UsageRepository`** (new, `usage/usage.repository.ts`) owns `ledger_entries`, the one new table this
  phase writes to.

A failed call (`UsageService.recordFailure`) still writes its `ai_requests` row (status `FAILED`, as
before), but writes no ledger entry: `TrafficControlService.abort` already released whatever budget was
held for it, so nothing was actually spent.

Token counting and cost calculation are not reimplemented here: `TokenCounter` (Phase 4) and
`budget/cost-estimator.ts` (the provider refactor) already do both in a way that is the same for every
provider, and `UsageService` just records what they produced.

## 2. Cost calculation

Unchanged from the provider refactor, because it was already built provider-independently; Task 3 asked for
exactly this and it already existed:

```ts
// budget/cost-estimator.ts
cost = ceil(inputTokens x model.inputTokenPrice) + ceil(outputTokens x model.outputTokenPrice)   // paid tier
cost = 0                                                                                          // free tier
```

- **Prices live in `ai_models`** (USD per 1,000,000 tokens), one row per provider's model. No price is ever
  written in code, so Gemini, a future OpenAI activation, and a future Anthropic activation all use the same
  formula against their own catalogue rows.
- **Amounts are integer micro-dollars** (1 USD = 1,000,000) end to end — the Redis budget hash, the ledger,
  and `ai_requests.estimatedCost` — so arithmetic is exact and never drifts the way floating-point dollars
  would.
- **Free tier (Task 8):** a provider account's tier (`free` or `paid`) is read from
  `ai_providers.configuration` (`{"tier": "free"}`). On a free tier, cost is always 0 — nothing is charged to
  the ledger or the budget — but tokens, requests and the `ai_requests`/ledger rows are still written, so a
  free-tier tenant has the same audit trail as a paid one, just at zero cost. Gemini is seeded free (a new
  Google AI Studio key is on Google's free plan); OpenAI and Anthropic are seeded paid for when they are
  switched on.

## 3. Budget enforcement

Also mostly already built, in Phase 5's `BudgetService` (`budget/budget.service.ts`) and
`TrafficControlService` (`traffic/traffic-control.service.ts`) — Task 5's exact method names
(`checkBudget`, `reserveBudget`, `releaseBudget`, `updateUsage`) already matched this phase's ask. What
Phase 7 adds is a second, optional budget period:

```
Before the call:  BudgetGuard does one cheap pre-check (monthly, and daily if the plan has one)
                   TrafficControlService.admit reserves the request's worst-case cost (both budgets)
After the call:    TrafficControlService.complete settles the reservation to the real cost (both budgets)
On any refusal:    whatever was reserved is released (both budgets) -- a refused request leaves no trace
```

A monthly budget is mandatory (every plan has one); a daily budget is optional
(`PlanLimits.dailyBudgetUsd`, `undefined` for every plan today, meaning no daily cap). When a plan does set
one, it is a wholly separate pool, reserved and settled alongside the monthly one — spending the whole day
does not touch the month's figures and vice versa. Either one being exhausted answers the same
`402 budget_exceeded`.

```ts
// traffic/plan-limits.ts
STARTUP: { ...., monthlyBudgetUsd: 100 }              // no daily cap: dailyBudgetMicroUsd is undefined
STARTUP: { ...., monthlyBudgetUsd: 100, dailyBudgetUsd: 5 } // a plan that does set one
```

**Token limits** (the third part of Task 9) are the existing per-minute `TokenQuotaService` from Phase 5,
unchanged.

## 4. Redis budget strategy

Unchanged mechanism from Phase 5 (one hash per period, atomic Lua scripts, checked before the call and
settled after); this phase only adds a second key shape for the optional daily period:

```
tenant:{T}:budget:202610            monthly budget hash   (monthlyLimit, currentUsage, reserved, remaining)
tenant:{T}:budget:daily:20261001    daily budget hash, same fields -- only exists for a plan with a daily cap
```

Both are read, reserved and settled by the same `BudgetService` methods and the same four Lua scripts
(`CHECK`, `RESERVE`, `RELEASE`, `SETTLE`); a `period: 'month' | 'day'` argument (default `'month'`, so every
Phase 5 call site needed no change) just picks the key, the bucket function (`monthBucket` or `dayBucket`)
and the TTL (40 days for the month, so a late settlement near midnight on the 1st still finds it; 3 days for
the day). `BudgetReservation` remembers which period and bucket it was taken against, so `releaseBudget` and
`updateUsage` settle the same key later without recomputing "now" — the existing Phase 5 behavior for the
month, now shared by the day.

Redis holds the fast, authoritative-for-admission figures; it is a cache of spend, not the record of it.
`ai_requests` and `ledger_entries` (Postgres) are the record, and would be how these counters get rebuilt if
Redis were ever lost.

## 5. The usage ledger (new)

`ledger_entries` existed in the schema since Phase 1 but nothing wrote to it until this phase. One row per
event, append-only — a correction is a new row, never an edit to one already written:

| Column            | Meaning                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `tenantId`        | Whose ledger this is.                                                                    |
| `requestId`       | The `ai_requests` row this entry is for; null for a manual entry (no request).           |
| `transactionType` | `AI_USAGE`, `CREDIT`, `ADJUSTMENT`, or `REFUND` (an extra value the schema already had). |
| `amount`          | USD, negative = charged to the tenant, positive = added to their account.                |
| `currency`        | `"USD"`.                                                                                 |

Every successful call writes exactly one `AI_USAGE` row, for the negative of its `estimatedCost` (so `"0"`,
not skipped, on a free tier — Task 8 again: the ledger is a usage record, not only a money-movement log). A
failed call writes none, because nothing was held for it by the time `UsageService` runs (`abort` already
released the reservation). If the `ai_requests` write itself fails, the ledger entry is still written,
without a `requestId` to link, because the spend (or the free-tier usage) happened regardless of whether the
detail row could be saved — and like the request record, a ledger write failure is logged, not raised: the
caller has already been served.

`UsageService.recordAdjustment()` can write a `CREDIT`, `ADJUSTMENT` or `REFUND` row directly, for a
tenantId with no request. It exists because the ledger's `transactionType` enum already includes those
values and the repository should support everything the schema allows, but **nothing calls it yet**: there
is no admin endpoint to issue a credit in this phase (that is a billing/support surface, explicitly out of
scope — see below).

## 6. API response metadata (Task 10)

The OpenAI-shaped response gains one additive field:

```json
{
  "usage": {
    "prompt_tokens": 11,
    "completion_tokens": 7,
    "total_tokens": 18,
    "estimated_cost": "0.00000500"
  }
}
```

`estimated_cost` is the same figure as `ai_requests.estimatedCost` and the ledger entry's `amount`
(unsigned here): a USD decimal string, `"0"` on a free tier. It is Tollbooth-specific and additive to the
OpenAI shape — an existing OpenAI client or SDK that reads only `prompt_tokens`/`completion_tokens`/
`total_tokens` is unaffected, since nothing removed or renamed a field it already read.

## 7. Future billing support

What exists today is governance (tracking, and stopping a tenant that has spent its budget), not billing;
the design leaves room for a billing phase without another rework:

- **An invoice** would sum a tenant's `AI_USAGE` ledger rows over a period — the ledger was built as the
  record for exactly that, not just as a debug log.
- **Crediting an account** already has a repository method (`recordAdjustment`) and a schema
  (`CREDIT`/`ADJUSTMENT`/`REFUND`); it needs an authenticated endpoint (and almost certainly an approval or
  audit step) in front of it, deliberately not built here.
- **Moving a provider off its free tier** is one row update (`ai_providers.configuration`), already live
  immediately on the next request — no code change, no deploy.
- **Per-tenant budgets, instead of per-plan ones,** would need a column (or a JSON field) on `Tenant` and a
  change to `TrafficLimits.forAuth`; the rest of the pipeline (reserve/settle, the ledger) is already
  tenant-scoped and would not change.
- **A real payment/subscription system** (invoicing, card charges, dunning) is out of scope for this
  project's governance layer entirely, not just deferred.

## What was already built (Phases 4-6) and reused as-is

- Token counting per call, and cost-from-tokens-and-prices: unchanged.
- Redis rate limits, token quotas and the per-provider circuit breaker: unchanged.
- The provider-independent `AIProvider` interface and the router: unchanged.

## What this phase explicitly did not build

- Kafka, or any event pipeline — usage is still written synchronously, in the request path, as it was in
  Phase 4.
- An analytics dashboard or rollups — `ai_requests` and `ledger_entries` are the raw data for one; nothing
  aggregates them yet.
- An AI security/content-scanning service.
- A billing subscription system (invoicing, payment, plan changes) — see "Future billing support" above.

## Testing

- `usage/usage.service.spec.ts`: records the request then the ledger entry; a free-tier call still writes a
  `0` entry; a failed call writes none; a ledger-write failure does not throw; `recordAdjustment` writes a
  manual entry.
- `test/providers.e2e-spec.ts`, `cost tracking` and `usage ledger` blocks: against the real gateway,
  Postgres and Redis — cost computed from the database prices, free tier charges nothing while still
  counting tokens, the tier can be switched live, a failed call costs nothing, the response's
  `estimated_cost` matches the stored one, and the ledger entry's sign, amount and `requestId` are correct.
- `test/redis-layer/budget.e2e-spec.ts`, `daily budget` block: the daily key is independent of the monthly
  one (its own Redis key, its own remaining balance), exhausting it is a 402 independent of how much of the
  month is left, and it settles/releases correctly.
- `test/daily-budget.e2e-spec.ts`: an end-to-end plan with a tiny daily cap and a roomy monthly one — the
  first call fits, the second is refused by `402 budget_exceeded` while the month has plenty left, the
  budget guard refuses it before the body is even validated, and a fresh period behaves like a fresh tenant.
- All of Phases 0-6's existing gateway and control-plane tests were re-run and still pass; none of this
  phase's changes touched their behavior (the daily budget is opt-in per plan, and no existing plan sets one).
