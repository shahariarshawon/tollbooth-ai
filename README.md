# Tollbooth AI

**Multi-tenant LLM gateway and AI governance platform.**

Tollbooth AI sits between your applications and AI providers (OpenAI, Anthropic, Gemini). It
controls who can use which model, tracks tokens and cost, enforces budgets, falls back between
providers when one fails, and screens prompts for sensitive data.

> **Status: Phase 0 (foundation).** The repo contains the monorepo, local infrastructure, CI and
> docs. Each service only exposes a `/health` endpoint. No business features exist yet.

## Architecture overview

```
Client Applications
        |
        v
 Tollbooth AI Gateway
        |
  -------------------
  |        |        |
OpenAI  Anthropic  Gemini
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
  gateway/         NestJS API gateway (port 3000)
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
pnpm --filter @tollbooth/dashboard dev        # http://localhost:3002
```

All Node services read the same `PORT` variable. When running several at once, override it per
process, for example `PORT=3001 pnpm --filter @tollbooth/control-plane dev`.

To run the AI service, see [apps/ai-service/README.md](apps/ai-service/README.md).

Quality checks:

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
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

1. **Phase 0**: foundation, monorepo, infrastructure (this phase)
2. **Phase 1**: multi-tenancy, database models, authentication and RBAC
3. **Phase 2**: API key management
4. **Phase 3**: gateway core, provider adapters, routing and fallback
5. **Phase 4**: rate limiting, budget enforcement and usage tracking
6. **Phase 5**: Kafka event pipeline and workers
7. **Phase 6**: AI security layer (PII detection, prompt filtering)
8. **Phase 7**: analytics dashboard
9. **Phase 8**: observability (OpenTelemetry, Prometheus, Grafana) and load testing (k6)

See [docs/development-guidelines.md](docs/development-guidelines.md) for coding and git conventions.
