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
  +--> OpenAI | Anthropic | Gemini
```

## Request path (hot path)

```
Client --> Gateway
             1. authenticate API key            (Redis cache, Postgres fallback)
             2. check rate limit and budget     (Redis atomic counters)
             3. scan prompt                     (AI Service: PII / policy)
             4. route to a provider, with fallback (OpenAI -> Anthropic -> Gemini)
             5. stream the response to the client
             6. publish a usage event           (Kafka, async, off the hot path)
```

Only steps 1-5 block the client. Usage accounting is asynchronous so that a slow database never
slows an LLM response.

## Components

### Client applications

Customer software that would normally call OpenAI directly. It calls the Gateway with a Tollbooth
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
Prisma. `pgvector` is enabled for embedding storage.

### Redis

Low-latency shared state: API key lookup cache, rate-limit windows and real-time budget counters.
It also backs BullMQ queues. Most of this data can be rebuilt from Postgres, except in-flight
counters.

### Kafka

The durable event log between the hot path and everything else. The Gateway publishes one usage
event per request. Consumers aggregate cost, alert on budgets and feed analytics. Partition by
tenant ID to keep per-tenant ordering.

### Workers (`apps/worker`)

Kafka consumers and BullMQ job processors: persist usage, roll up analytics, send budget alerts and
run scheduled jobs. They scale independently of request traffic.

### Dashboard (`apps/dashboard`)

Next.js UI for three personas: admins (tenants, budgets, permissions), developers (keys, usage) and
finance (cost by team and model). It talks only to the Control plane.

### Observability

Services emit OpenTelemetry traces and Prometheus metrics. Grafana visualises them.

## Kafka vs BullMQ

| Concern                      | Kafka                             | BullMQ (Redis)                  |
| ---------------------------- | --------------------------------- | ------------------------------- |
| Usage and audit events       | Yes: durable, replayable, fan-out | No                              |
| Delayed or retried jobs      | No                                | Yes: per-job retry, delay, cron |
| Multiple independent readers | Yes (consumer groups)             | No (one consumer takes a job)   |

## Key decisions

- **Monorepo with pnpm workspaces**: one place for shared types and config, and atomic cross-service changes.
- **Gateway and control plane split**: isolates the latency-critical path from admin workloads.
- **Kafka for events, BullMQ for jobs**: each is used for what it is good at.
- **KRaft-mode Kafka locally**: no Zookeeper to run or maintain.
- **Env validation in `@tollbooth/config`**: misconfiguration fails at startup.
