# Kafka Event System and Async Processing (Phase 8)

This is the event-driven foundation [system-design.md](system-design.md) described from Phase 0
("usage events → Kafka → Worker, async, off the hot path") but that, until this phase, nothing actually
built: the gateway recorded usage synchronously (Phase 4, then Phase 7's ledger) and stopped there. Phase 8
adds the announcement on top of that, for whatever consumes it next.

```
AI Request Completed (gateway, synchronous, unchanged: Postgres is still the source of truth)
        |
        v
Kafka Event            usage.completed, or provider.failed on a real provider failure
        |
        v
Background Workers     apps/worker: today, logs what arrived
```

## 1. What changed, and what did not

The request path (`GatewayService.createChatCompletion`) is unchanged up through recording the outcome:
`UsageService.recordSuccess`/`recordFailure` still write `ai_requests` and (Phase 7) `ledger_entries`
exactly as before, synchronously, awaited. The one addition is one line after that: a Kafka publish, which
is **fire-and-forget** — not awaited, and `KafkaService.publish` never throws — so it cannot add latency or
a new way for a request to fail. Postgres remains the system of record regardless of whether this event is
ever published or consumed; Kafka is purely an async announcement layered on top of a flow that already
worked.

```ts
// apps/gateway/src/usage/usage.service.ts
async recordSuccess(input): Promise<void> {
  const requestId = await this.requests.recordSuccess(input);     // unchanged (Phase 4/7)
  await this.writeLedgerEntry({ ... });                            // unchanged (Phase 7)
  void this.kafka.publish(KAFKA_USAGE_TOPIC, event, input.auth.tenantId); // new: not awaited
}
```

## 2. Producer/consumer design

**`@tollbooth/kafka`** (new shared package, `packages/kafka/`) is the one Kafka client both apps use, so
there is exactly one connection policy and one way to serialize an event, not two:

```
packages/kafka/src/
├── kafka.config.ts      topic and consumer-group constants, KAFKA_BROKER parsing
├── kafka.module.ts      KafkaModule.forRoot() / .forRootAsync() — a NestJS dynamic module
├── kafka.service.ts     KafkaService: the only thing that talks to kafkajs
├── retry.ts             a small bounded retry for one message handler call
└── events/
    ├── usage-completed.event.ts
    └── provider-failed.event.ts
```

The gateway only ever calls `KafkaService.publish()`; the worker only ever calls
`KafkaService.subscribe()`. Each app gets its own `KafkaService` instance (its own connection), via
`KafkaModule.forRootAsync({ useFactory: () => ({ clientId, brokers: parseBrokers(loadConfig().KAFKA_BROKER) }) })`
in `usage.module.ts` (gateway) and `worker.module.ts` (worker).

**Why `forRootAsync`, not a plain options object:** the options factory must not run until Nest actually
builds the provider — which happens inside `NestFactory.create()`, after `bootstrap()` has called
`loadDotEnv()`. A plain `KafkaModule.forRoot({ brokers: parseBrokers(loadConfig().KAFKA_BROKER) })` would
call `loadConfig()` while the module's `imports: [...]` array is being _declared_, which happens as soon as
the file is imported — before `.env` has been loaded, so `DATABASE_URL`, `KAFKA_BROKER` and friends are
still undefined and `loadConfig()` throws. `forRootAsync` registers the factory as a provider and only
invokes it later, during DI resolution. (`KafkaModule.forRoot()` still exists, and is what the packages's
own tests use, for a case where the options really are already known synchronously.)

## 3. Event definitions

```ts
// usage-completed.event.ts — published on every successful call
interface UsageCompletedEvent {
  requestId: string;
  tenantId: string;
  projectId: string;
  provider: string;
  model: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  estimatedCost: string; // USD decimal string, "0" on a free tier — matches ai_requests.estimatedCost
  latencyMs: number;
  timestamp: string; // ISO 8601
}

// provider-failed.event.ts — published only for a real provider failure
interface ProviderFailedEvent {
  requestId: string;
  tenantId: string;
  provider: string;
  model: string;
  errorKind: string; // 'auth' | 'rate_limited' | 'timeout' | 'unavailable'
  timestamp: string;
}
```

`ProviderFailedEvent` is **not** published for `errorKind: 'bad_request'`: that is the provider refusing
the request itself (a bad parameter, a blocked prompt), which is the caller's problem, not the provider's —
the same definition the circuit breaker already uses to decide what counts against a provider
(provider-router.md). A `UsageCompletedEvent`, by contrast, is published for every success including a
free-tier one (`estimatedCost: "0"`): usage, not just spend, is worth knowing about downstream.

## 4. Topics

| Constant               | Topic             | Published on                                                             |
| ---------------------- | ----------------- | ------------------------------------------------------------------------ |
| `KAFKA_USAGE_TOPIC`    | `usage.completed` | Every successful `/v1/chat/completions` call                             |
| `KAFKA_PROVIDER_TOPIC` | `provider.failed` | A provider call failing as `auth`/`rate_limited`/`timeout`/`unavailable` |

Each has its own consumer group constant (`KAFKA_USAGE_GROUP`, `KAFKA_PROVIDER_GROUP`), so scaling the
worker to several instances splits a topic's partitions across them, and the two topics' consumers never
share a group (and so never rebalance each other).

## 5. The worker

`apps/worker/src/worker/` (new): `UsageWorker` subscribes to both topics on `onModuleInit` and logs what it
receives — the whole of this phase's "do something with the event" step, deliberately:

```
Received UsageCompleted: tenantId=<id> provider=GOOGLE model=gemini-2.0-flash tokens=18 cost=0.00000500
Received ProviderFailed: tenantId=<id> provider=GOOGLE model=gemini-2.0-flash errorKind=timeout
```

Turning that log line into real work (a usage rollup, a budget alert, a billing export) is for a later
phase; this phase proves the pipe end to end first — which was verified against a real broker, not a mock
(see Testing below).

## 6. Error handling (Task 6)

Nothing here can bring an app down over a Kafka problem, or make a request slower waiting on one:

- **Connection.** `KafkaService.onModuleInit()` tries to connect the producer (or, for the worker, each
  consumer connects when `subscribe()` is called); a failure is logged and swallowed, not thrown, so the
  app finishes starting regardless. The `Kafka` client's own `retry` option
  (`{ retries: 3, initialRetryTime: 200, maxRetryTime: 2000 }`) is deliberately bounded, so a broker that is
  entirely absent (for example, in CI, which has no Kafka service — see Testing) fails in about a second,
  not minutes.
- **Reconnect.** Once connected, kafkajs reconnects a dropped connection by itself; nothing here needs to
  implement that. If the _initial_ connect failed, `publish`/`subscribe` do not retry a connect on every
  call (that would add the same bounded delay to every request); they log once and no-op until the process
  is restarted with Kafka reachable.
- **Consumer retry.** One message's handler is retried up to `maxMessageRetries` (default 2) times with a
  short backoff (`retry.ts`, `withBoundedRetry`), then logged and skipped — the partition is not left stuck
  behind one message forever. There is no dead-letter queue yet; see "Future usage" below.
- **Graceful shutdown.** `KafkaService.onModuleDestroy()` disconnects the producer and every consumer.
  Both apps already call `app.enableShutdownHooks()` (from Phase 0/4), so this runs automatically on
  `SIGTERM`/`SIGINT` — no change needed there.
- **No data loss:** the data these events describe (`ai_requests`, `ledger_entries`) is written to Postgres
  _before_ the event is published, and that write is unaffected by anything in this section. Losing an
  event loses a notification, never the record.

## 7. Local development (Task 7)

Kafka already existed in `docker-compose.yml` since Phase 0 (KRaft mode, no Zookeeper); nothing there
needed to change. Bring it up with the rest of the stack:

```bash
pnpm infra:up           # postgres, redis, kafka, kafka-ui, …
docker compose ps kafka # STATUS should become "healthy" within ~20s
```

`KAFKA_BROKER=localhost:9094` in `.env` matches the compose file's external listener. Verified locally this
phase: the container reaches `healthy`, `kafka-topics.sh --list` shows `usage.completed` and
`provider.failed` once something has published to them (Kafka auto-creates a topic on first use; nothing
pre-creates them), and a real gateway + worker pair exchanged a real event (see Testing).

## 8. Testing

- **`packages/kafka/src/kafka.service.spec.ts`, `retry.spec.ts`** (run by `pnpm test`, in CI): kafkajs is
  mocked, so these are fast and need no broker. They check the wrapper's own logic: connect failure is
  swallowed, `publish` no-ops when not connected and never throws, `subscribe` parses and dispatches a
  message, a failing handler is retried `maxMessageRetries` times then skipped, and `onModuleDestroy`
  disconnects everything that connected.
- **`packages/kafka/test/kafka.e2e-spec.ts`** (real broker, **not** run by CI — see below): a producer
  sends an event and a consumer in its own group receives it; several events arrive in order; a handler
  that fails twice then succeeds is retried and the next message still gets through. Run locally with Kafka
  up: `pnpm infra:up && pnpm --filter @tollbooth/kafka test:e2e`.
- **`apps/gateway/src/usage/usage.service.spec.ts`** (extended): a successful call publishes a
  `usage.completed` event with the right fields, keyed by tenant; a real provider failure publishes
  `provider.failed`; a `bad_request` failure publishes nothing.
- **`apps/worker/src/worker/usage.worker.spec.ts`** (new): subscribes to both topics in their own consumer
  groups; logs a usage-completed and a provider-failed event without throwing.
- **Live, end to end** (manual, this phase): a built gateway (pointed at the bundled fake Gemini) and a
  built worker were run against the real Postgres, Redis and Kafka from `docker-compose`. One real chat
  completion produced:
  ```
  [UsageWorker] Received UsageCompleted: tenantId=<id> provider=GOOGLE model=gemini-2.0-flash tokens=18 cost=0.00000500
  ```
  in the worker's log — the whole pipeline, for real, not simulated.
- **Regression:** every gateway and control-plane unit and e2e test from Phases 0-7 was re-run, both with
  Kafka up (66s for the gateway e2e suite, no change from before this phase) and with it stopped entirely
  (75s — a few seconds slower, since every test file's `createTestContext()` pays the bounded failed-connect
  cost once — but still **199/199 passing**, proving the gateway truly does not depend on Kafka being
  reachable).

**Why CI does not run the Kafka e2e tests:** `.github/workflows/ci.yml` only provisions Postgres and Redis
as services; it has no Kafka container, and was deliberately left unchanged (Phase 8's rule was "only
create the event-driven foundation", not "add infrastructure to CI"). This works out cleanly because the
gateway's own tests already prove it degrades gracefully without Kafka (previous point) — so CI staying
Kafka-less is exercising a real, intentionally-supported mode, not a gap. Adding a Kafka service to CI
(to run `@tollbooth/kafka`'s real-broker tests there too) is a reasonable, independent follow-up.

## 9. Future usage for billing and analytics

This phase is the pipe, not what flows through it yet:

- **Analytics.** A worker consumer for `usage.completed` that rolls tokens and cost up by tenant/model/day
  (into a new table, or into a time-series store) is a natural next worker, consuming the exact event this
  phase already publishes — no gateway change needed.
- **Billing.** `estimatedCost` on `usage.completed` is the same figure Phase 7 writes to the ledger
  (`ledger_entries`, `AI_USAGE`). A billing export/invoice worker could consume the event stream instead of
  (or in addition to) querying the ledger directly, if an async, replayable feed of charges is wanted.
- **Alerting.** A worker consuming `provider.failed` that notices repeated failures for one provider (echoing,
  asynchronously, what the circuit breaker already reacts to synchronously) could page someone — using the
  same event this phase already publishes.
- **A dead-letter topic.** Right now a message that keeps failing is logged and dropped
  (`maxMessageRetries` exhausted). A `usage.completed.dlq` topic that a failed message is republished to,
  instead of dropped, would make those failures inspectable and replayable later — a direct extension of
  `KafkaService.subscribe`'s existing retry-then-give-up path.
- **Idempotency.** A consumer that does more than log (for instance, incrementing a rollup) needs to handle
  redelivery (a consumer restart reprocesses uncommitted messages) itself — `requestId` on every event
  exists so a consumer can deduplicate by it.
