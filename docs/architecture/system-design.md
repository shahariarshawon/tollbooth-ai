# System Design

Tollbooth AI sits between client applications and LLM providers. It decides who may call what,
forwards the request, and records what it cost.

> This document describes the target architecture. Phase 0 provides only the skeleton: service
> bootstraps with health endpoints, and the local infrastructure.

## High-level view

```
                     Client Applications
                     (apps using Tollbooth API keys)
                              |
                              v
                        +-----------+
                        |   Nginx   |   routing, streaming passthrough
                        +-----------+
                         |    |     |
        /v1/*            |    |     |   /
      +------------------+    |     +-----------------+
      v                       v /api/*                v
+-------------+        +---------------+        +-------------+
|   Gateway   |        | Control Plane |<-------|  Dashboard  |
|   (NestJS)  |        |   (NestJS)    |        |  (Next.js)  |
+-------------+        +---------------+        +-------------+
  |   |   |                   |
  |   |   +--> AI Service     |  tenants, users, RBAC,
  |   |        (FastAPI)      |  API keys, budgets, policies
  |   |                       |
  |   +----> Redis <----------+   rate limits, budget counters, key cache
  |                           |
  |              +------------+
  |              v
  |         PostgreSQL (+ pgvector)
  |              ^
  +--> usage events --> Kafka --> Worker
  |
  +--> AI provider router --> Gemini (active) | OpenAI | Anthropic (ready)
```

## Request path (hot path)

```
Client --> Gateway
             1. authenticate API key            (Redis cache, Postgres fallback)
             2. check rate limit and budget     (Redis atomic counters)
             3. scan prompt                     (AI Service: PII / policy)
             4. route to a provider (Gemini is active; OpenAI and Anthropic are ready)
             5. stream the response to the client
             6. publish a usage event           (Kafka, async, off the hot path)
```

Only steps 1-5 block the client. Usage accounting is asynchronous so that a slow database never
slows an LLM response.

## Components

### Client applications

Customer software that would normally call an AI provider directly (often through an OpenAI client library). It calls the Gateway with a Tollbooth
API key. Changing the base URL and key should be the only integration work.

### Gateway API (`apps/gateway`)

The data plane. A stateless NestJS service that authenticates keys, enforces rate limits and
budgets, applies security policy, routes to providers with fallback, and emits usage events. It
must scale horizontally and hold no per-request state outside Redis.

### Control plane (`apps/control-plane`)

The management plane. A NestJS service that owns tenants, users, roles (RBAC), API keys, budgets,
model permissions and policies. It is the source of truth for configuration. It is separate from
the Gateway so that management traffic cannot starve inference traffic, and so the two scale and
deploy independently.

### AI service (`apps/ai-service`)

Python/FastAPI. Hosts work that belongs in the Python ecosystem: PII detection, prompt analysis
and embeddings. The Gateway calls it over HTTP.

### PostgreSQL (`prisma/`)

System of record: tenants, users, keys, budgets, policies and aggregated usage. Accessed through
Prisma. The `vector` extension is enabled, but no feature uses it yet.

### Redis

Low-latency shared state: rate-limit windows, real-time budget counters and the provider circuit
breaker's state. Most of this data can be rebuilt from Postgres, except in-flight counters.

### Kafka

The durable event log between the hot path and everything else. The Gateway publishes one usage
event per request. Consumers aggregate cost, alert on budgets and feed analytics. Partition by
tenant ID to keep per-tenant ordering.

### Workers (`apps/worker`)

Kafka consumers. Today the worker subscribes to the usage and provider-failure topics and logs what it
receives; it does no other work yet. Usage itself is written to PostgreSQL by the gateway, not by the
worker.

### Dashboard (`apps/dashboard`)

Next.js UI for three personas: admins (tenants, budgets, permissions), developers (keys, usage) and
finance (cost by team and model), plus a static public landing page. Its server-side routes (`/api/auth/*`,
`/api/cp/*`) are a backend-for-frontend: they hold the session in httpOnly cookies and are the only client of
the control plane, which is not reachable from the public edge.

### Observability

The gateway writes structured logs with a request id and exposes Prometheus metrics, which Grafana
visualises. There is no distributed tracing, and the control plane exposes no metrics.

## Key decisions

- **Monorepo with pnpm workspaces**: one place for shared types and config, and atomic cross-service changes.
- **Gateway and control plane split**: isolates the latency-critical path from admin workloads.
- **Kafka for events**: durable, replayable, and readable by independent consumers. No job queue is used.
- **KRaft-mode Kafka locally**: no Zookeeper to run or maintain.
- **Env validation in `@tollbooth/config`**: misconfiguration fails at startup.
