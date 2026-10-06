# Security model

What is protected, how, and the assumptions each protection makes. Where something is not done yet, it says so.

## Who can reach what

- **Public edge** (Nginx): `/v1/*` to the gateway, everything else to the dashboard. It sets
  `X-Content-Type-Options`, `X-Frame-Options: DENY` and a `Referrer-Policy`, hides its version, and rate limits
  per client address (a looser limit for `/v1/`, a strict one for `/api/auth/`). Body size is capped at 1 MB
  (2 MB on `/v1/`, just above the gateway's own limit so oversized bodies get the gateway's JSON error).
- **Control plane**: has no route from the edge and sits on a separate network from it. The dashboard's server
  code is its only client. `/api/*` is never forwarded to it: those paths belong to the dashboard's
  backend-for-frontend, and a smoke test fails if that changes.
- **Data stores** (PostgreSQL, Redis, Kafka): not published to the host in the production compose file.

## Client addresses and proxies

An address taken from `X-Forwarded-For` is only as trustworthy as the proxy that wrote it.

- Nginx **replaces** `X-Forwarded-For` with the address of the connection it accepted. It never appends to a
  header the client sent. A smoke test sends a forged header and checks it does not reach the gateway.
- The control plane ignores `X-Forwarded-For` unless `TRUST_PROXY_HOPS` is set, and then trusts exactly that
  many proxies. In the compose stack that is 1: the dashboard's server, which forwards the address Nginx set.
  Setting it higher than the real number lets a client choose its own address.
- This matters because brute-force limits (sign-in, the demo session) are keyed on the client address.
- If a load balancer sits in front of Nginx, configure Nginx's real-IP module for it; otherwise all clients
  share the balancer's address and its limits.

## Sessions

- Access tokens are short-lived JWTs (15 minutes by default). Refresh tokens are opaque, stored only as
  SHA-256 hashes, rotate on every use, and are grouped in families: presenting an already-used token revokes
  the whole family and writes `TOKEN_REUSE_DETECTED` to the audit log.
- The browser never sees a token. The dashboard's server stores them in `httpOnly` cookies
  (`SameSite=Lax`, `Secure` in production) and attaches the bearer token itself. Nothing is kept in
  `localStorage`. A separate, readable `tb_user` cookie holds only the display profile and is not trusted for
  any decision.
- State-changing BFF requests must carry an `Origin` that matches the host (CSRF defence on top of `SameSite`).
- Account state, tenant and role are re-read from the database on every request, so disabling a user or
  changing a role takes effect immediately.

## Tenant isolation

- Every tenant-owned table has `tenantId`, and references between tenant-owned rows use composite foreign
  keys `(id, tenantId)`, so a cross-tenant link cannot be stored.
- The tenant of a request comes from the user's database record, never from the token. A tenant user sending a
  different `X-Tenant-Id` gets 403; only `SUPER_ADMIN` may choose a tenant that way.
- Isolation is covered by end-to-end tests for analytics, the dashboard overview, API keys and the demo.

## API keys

Keys are shown once at creation and stored as SHA-256 hashes plus a short display prefix. The gateway looks up
the hash. Provider credentials live only in the gateway's environment.

## Rate limits and abuse controls

- Sign-in: per address and per account, in Redis (falling back to per-instance memory if Redis is down).
- Demo session: per address and a global ceiling, because it needs no credentials.
- Gateway: per key and per tenant, requests and tokens, enforced atomically in Redis; fail closed by default.

## The demo workspace

See [ADR 0007](adr/0007-public-demo-architecture.md). In short: no credential exists for it, it is read-only by
a server-side policy, its sessions end on a fixed deadline, and it is off unless `DEMO_MODE` is set.

## Not done yet

- A Content-Security-Policy for the dashboard.
- Redaction rules for logs beyond not logging keys and tokens, and a review of what the AI service echoes back
  in findings.
- Container and dependency scanning, secret scanning and static analysis in CI.
