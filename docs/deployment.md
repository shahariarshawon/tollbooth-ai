# Deployment

Two ways to run Tollbooth AI outside development: the full stack on one Docker host, and a lower-cost
profile that splits it across hosted services. Both use the same images and the same configuration; they
differ in what is deployed and where the data stores live.

## Configuration, per service

Each service validates only the variables it reads, and refuses to start with one message listing every
problem (`packages/config`).

| Service       | Requires                                                                     | Optional                                                      |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Gateway       | `DATABASE_URL`, `REDIS_URL` (or `REDIS_HOST`), `KAFKA_BROKER`                | provider keys, `AI_SERVICE_URL`, `GATEWAY_*` tuning           |
| Control plane | `DATABASE_URL`, `REDIS_URL` (or `REDIS_HOST`), `JWT_SECRET` (32+ characters) | `JWT_*_EXPIRE`, `BCRYPT_ROUNDS`, `DEMO_*`, `TRUST_PROXY_HOPS` |
| Worker        | `KAFKA_BROKER`                                                               |                                                               |
| Dashboard     | `CONTROL_PLANE_URL`                                                          | `DEMO_MODE`                                                   |

The gateway does not need `JWT_SECRET`; the worker needs no database or Redis. Templates:
[.env.example](../.env.example) and [.env.production.example](../.env.production.example).

## Database: migrations and seeding

A fresh database is built with `prisma migrate deploy`, which applies the committed migrations and nothing
else. `prisma migrate dev` is for development only. CI builds a database this way and fails if the result
differs from `schema.prisma`.

The `migrate` image runs this as a **one-shot job**, so the applications never race to migrate:

```bash
docker run --rm -e DATABASE_URL=... tollbooth/migrate                    # migrations only
docker run --rm -e DATABASE_URL=... tollbooth/migrate migrate-and-seed   # migrations + reference data
docker run --rm -e DATABASE_URL=... tollbooth/migrate seed demo         # the demo workspace (optional)
```

Seeds are separate and explicit:

| Target      | Creates                                                           | Safe in production                                                     |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `reference` | providers, models, billing plans                                  | yes. Creates what is missing, never overwrites, creates no users       |
| `demo`      | the demo tenant, generated traffic, users with no usable password | yes. Touches only the tenant flagged `isDemo`; needs `reference` first |
| `dev`       | a sample tenant with a publicly documented password               | **no**. Refuses when `NODE_ENV=production`                             |

A database that was created earlier with `prisma db push` has no migration history. Mark the existing
migrations as applied instead of re-running them: `prisma migrate resolve --applied <migration_name>` for each
directory under `prisma/migrations`, then `prisma migrate deploy`.

## Full stack on one Docker host

```bash
cp .env.production.example .env.production      # POSTGRES_PASSWORD, JWT_SECRET, GRAFANA_ADMIN_PASSWORD, provider keys
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Order: PostgreSQL, Redis, Kafka, then the `migrate` job, then the services, then Nginx. Services wait for the
job to finish successfully. Only Nginx (port `HTTP_PORT`, default 80) and Grafana are published; PostgreSQL,
Redis, Kafka and the control plane are not.

| Path            | Goes to                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| `/v1/*`         | gateway                                                                               |
| `/api/*`        | dashboard (its backend-for-frontend routes `/api/auth/*`, `/api/cp/*`, `/api/health`) |
| everything else | dashboard                                                                             |

The control plane has no route from the edge and is on a separate network from Nginx. Only the dashboard's
server code calls it. `scripts/smoke/compose-stack.sh` starts this stack from empty volumes and checks the
routes, the migration job, the demo flow and the isolation; CI runs it.

TLS is not terminated by this compose file. Put it behind whatever provides HTTPS and set
`Strict-Transport-Security` there; the Nginx config deliberately does not, because HSTS is only correct where
HTTPS is guaranteed. If a load balancer sits in front of Nginx, Nginx must be told to trust its address
(`ngx_http_realip_module`), otherwise every client appears to have the balancer's address.

### Enabling the public demo

```bash
# .env.production
DEMO_MODE=true
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate seed demo
```

Both the control plane and the dashboard read `DEMO_MODE`. See
[ADR 0007](adr/0007-public-demo-architecture.md) for what a demo session can and cannot do.

## Lower-cost public profile

For a portfolio demo on free tiers, run only what the demo needs and keep the full architecture for local use:

| Part                      | Where                                | Notes                                                                                           |
| ------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Dashboard                 | a Node host or Vercel-style platform | `CONTROL_PLANE_URL`, `DEMO_MODE`                                                                |
| Control plane             | any container host                   | private to the dashboard if the platform allows; set `TRUST_PROXY_HOPS` to the real proxy count |
| Gateway                   | any container host                   | needs a reachable Kafka only for usage events (see below)                                       |
| AI service                | any container host                   |                                                                                                 |
| PostgreSQL, Redis         | managed free tiers                   | `REDIS_URL` may be `rediss://` (TLS); Upstash hosts always use TLS                              |
| Kafka, worker, monitoring | not deployed                         |                                                                                                 |

The landing page (`/`) is static: it does not call any backend, so it loads even while free-tier compute is
asleep. Only `/demo` and the dashboard need the control plane.

Without Kafka the gateway still serves requests (`KAFKA_BROKER` must still be set, to an address that may be
unreachable): it logs that the producer could not connect and skips publishing usage events, and it does not
retry the connection until it is restarted with Kafka reachable. Usage is still written to PostgreSQL, so the dashboard, analytics, ledger and budgets
are unaffected; only downstream event consumers (the worker) see nothing. There is currently no queue that
replays skipped events. Free-tier hosts that sleep add a cold start to the first request.

No vendor is assumed by the code: everything above is configuration.

## Health checks

Every service answers `GET /health` (the dashboard at `/api/health`). The gateway and control plane report
PostgreSQL (and Redis for the gateway) and answer 503 when degraded. The dashboard's check does not call the
control plane, so a slow backend never gets a healthy dashboard restarted.
