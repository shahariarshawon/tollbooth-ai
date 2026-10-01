# Tollbooth AI

**Multi-tenant LLM gateway and AI governance platform.**

Tollbooth AI sits between your applications and AI providers. Gemini is the active provider; OpenAI and
Anthropic are implemented and ready to switch on. It controls who can use which model, tracks tokens and
cost, enforces budgets and rate limits, and stops sending traffic to a provider that is failing.

> **Status: the gateway is provider-agnostic, with Gemini active.** Foundation, database, the control plane
> (authentication, RBAC, tenant isolation), the dashboard, the OpenAI-compatible gateway and its Redis traffic
> controls (rate limits, token quotas, budget counters, circuit breaker), provider-independent cost tracking
> and a usage ledger, and a Kafka event pipeline with a worker consuming it are all in place. The dashboard
> shows sample data for projects, API keys and usage until their backends exist.

## Architecture overview

```
Client Applications
        |
        v
 Tollbooth AI Gateway
        |
        v
 AI Provider Router
        |
  ---------------------------------
  |                |              |
Gemini (active)  OpenAI (ready)  Anthropic (ready)
```

The gateway (data plane) is kept separate from the control plane (management), and usage events are
processed asynchronously through Kafka. See [docs/architecture/system-design.md](docs/architecture/system-design.md)
for the full design.

## Technology stack

| Area           | Technology                         |
| -------------- | ---------------------------------- |
| Backend        | TypeScript, Node.js, NestJS        |
| Frontend       | Next.js, Tailwind CSS, shadcn/ui   |
| AI service     | Python, FastAPI                    |
| Data           | PostgreSQL, Prisma, pgvector       |
| Cache / queues | Redis, BullMQ                      |
| Events         | Apache Kafka (KRaft)               |
| Infrastructure | Docker, Docker Compose, Nginx      |
| Monitoring     | OpenTelemetry, Prometheus, Grafana |
| Testing        | Jest, k6                           |

## Repository structure

```
apps/
  gateway/         OpenAI-compatible LLM gateway, NestJS (port 3000)
  control-plane/   NestJS management backend (port 3001)
  dashboard/       Next.js frontend (port 3002)
  worker/          Background workers (port 3003, health only)
  ai-service/      FastAPI AI processing service (port 8000)
packages/
  shared/          Shared types and utilities
  config/          Environment validation (zod)
prisma/            Database schema
infra/             Docker, Nginx, Kafka, Postgres, Redis and monitoring config
docs/              Architecture, API and database docs
scripts/           Helper scripts
```

## Local development

Prerequisites: Node.js 22+, pnpm 10+, Docker with Compose v2, Python 3.12+ (for `ai-service`).

```bash
# 1. Install dependencies and build the shared packages
pnpm install
pnpm --filter "./packages/*" build

# 2. Configure the environment
cp .env.example .env          # then set JWT_SECRET (e.g. openssl rand -base64 48)

# 3. Start infrastructure
pnpm infra:up

# 4. Create the database schema and development data
pnpm db:migrate
pnpm db:seed

# 5. Run services (each in its own terminal)
pnpm --filter @tollbooth/gateway dev          # PORT is read from .env
pnpm --filter @tollbooth/control-plane dev
pnpm --filter @tollbooth/worker dev
pnpm --filter @tollbooth/dashboard dev        # http://localhost:3002 (sign in: admin@techcorp.com)
```

The control plane (authentication, users, tenants) runs on the port you give it and reads `.env` in
development. After `pnpm db:seed` you can sign in as `admin@techcorp.com` with `ChangeMe123!`; see
[docs/api/authentication.md](docs/api/authentication.md).

All Node services read the same `PORT` variable. When running several at once, override it per
process, for example `PORT=3001 pnpm --filter @tollbooth/control-plane dev`.

The gateway serves `POST /v1/chat/completions` in the OpenAI format and routes to Gemini. Set `GOOGLE_AI_API_KEY`
in `.env`, then
`pnpm gateway:test` sends a request through it; see [docs/api/gateway-api.md](docs/api/gateway-api.md).

To run the AI service, see [apps/ai-service/README.md](apps/ai-service/README.md).

Quality checks:

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test

# Integration tests against the real Postgres from docker compose
pnpm --filter @tollbooth/control-plane test:e2e
pnpm --filter @tollbooth/gateway test:e2e     # uses local fakes of Gemini, OpenAI and Anthropic, no API key needed
```

## Docker setup

`docker-compose.yml` runs the infrastructure only. The apps run on the host during development.

| Service    | URL / port            | Notes                                                 |
| ---------- | --------------------- | ----------------------------------------------------- |
| PostgreSQL | `localhost:5432`      | pgvector enabled, persistent volume                   |
| Redis      | `localhost:6379`      | append-only persistence                               |
| Kafka      | `localhost:9094`      | single-node KRaft, for host clients                   |
| Kafka UI   | http://localhost:8080 | development tool                                      |
| Prometheus | http://localhost:9090 |                                                       |
| Grafana    | http://localhost:3030 | `admin` / `admin` by default                          |
| Nginx      | http://localhost:8088 | optional: `docker compose --profile edge up -d nginx` |

```bash
docker compose up -d          # start
docker compose ps             # all services should become "healthy"
docker compose down           # stop (data is kept)
docker compose down -v        # stop and delete all data
```

If a host port is already taken (for example a local Postgres on 5432 or Redis on 6379), set
`POSTGRES_PORT` or `REDIS_PORT` in `.env` and update `DATABASE_URL` or `REDIS_URL` to match.

Database design, commands and seed data: [docs/database/database-design.md](docs/database/database-design.md).

Credentials in `docker-compose.yml` are development defaults, overridable through `.env`. Never
reuse them outside local development.

## Roadmap

1. **Phase 0**: foundation, monorepo, infrastructure (done)
2. **Phase 1**: database schema, Prisma, migrations, seed (done)
3. **Phase 2**: authentication, RBAC, tenant isolation, user and tenant management (done)
4. **Phase 3**: dashboard frontend (done): [docs/frontend/dashboard-guide.md](docs/frontend/dashboard-guide.md)
5. **Phase 4**: LLM gateway core (done): [docs/api/gateway-api.md](docs/api/gateway-api.md)
6. **Phase 5**: Redis layer: rate limits, token quotas, budget counters, circuit breaker (done):
   [docs/architecture/redis-layer.md](docs/architecture/redis-layer.md)
7. **Phase 6**: provider-agnostic routing with Gemini active, OpenAI and Anthropic ready (done):
   [docs/architecture/provider-architecture.md](docs/architecture/provider-architecture.md) and
   [docs/architecture/provider-router.md](docs/architecture/provider-router.md)
8. **Phase 7**: usage metering, provider-independent cost engine, budget enforcement and the usage
   ledger (done): [docs/architecture/usage-cost-engine.md](docs/architecture/usage-cost-engine.md)
9. **Phase 8**: Kafka event pipeline and a worker consuming it (done):
   [docs/architecture/kafka-events.md](docs/architecture/kafka-events.md)
10. **Next**: projects and API key management endpoints in the control plane
11. AI security layer (PII detection, prompt filtering), provider failover
12. Turning the logged Kafka events into real work: usage rollups, budget alerts, a billing export
13. Analytics, then observability (OpenTelemetry, Prometheus, Grafana) and load testing (k6)

See [docs/development-guidelines.md](docs/development-guidelines.md) for coding and git conventions.
