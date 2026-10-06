# ADR 0007: Public demo architecture

Status: accepted

## Context

A portfolio project needs a way for a reviewer to look at the product with data in it, without registering and
without the author publishing a login that works on a production system. A shared password published in a
README is a standing credential: it gets used, changed, or abused, and it has to be kept secret from a system
that is itself public.

## Decision

The demo is a **dedicated tenant**, flagged `tenants.isDemo`, entered through a **passwordless, read-only,
time-limited session**, and it exists only where `DEMO_MODE=true`.

- **No credential.** The demo user's password hash is the sentinel `!`, which is not a bcrypt hash, so no
  password can ever match it. `POST /auth/login` cannot enter the account. The only way in is
  `POST /auth/demo`, which the dashboard calls from a button.
- **Off by default.** With `DEMO_MODE` unset the endpoint answers 404 and the dashboard's `/demo` page says
  the demo is not enabled. The control plane and the dashboard each check the switch.
- **Read-only, by policy, on the server.** `DemoPolicyGuard` refuses any non-read request (anything but
  `GET`, `HEAD`, `OPTIONS`) in a demo tenant with 403 and a clear message. It applies to whoever acts in that
  tenant, including a `SUPER_ADMIN` using `X-Tenant-Id`. It runs after authentication, tenant resolution and the
  role check, and only ever **narrows** access: it grants nothing and relaxes nothing. There is no
  "if demo, skip authorization" path anywhere; tenant isolation and RBAC are the same code as for any tenant.
- **Short, non-extendable sessions.** A session lasts `DEMO_SESSION_MINUTES` (30 by default) in total. Refresh
  tokens rotate as usual, but a demo token's replacement keeps the original expiry, and access tokens never
  outlive the session. Refresh-token replay detection is unchanged.
- **Throttled.** The route allows 10 sessions per client address per hour and 300 per hour overall.
- **Synthetic data, separate from everything.** The seed generates a month of traffic, teams, projects and
  alerts in the demo tenant only. It refuses to run if the demo slug belongs to a tenant that is not flagged,
  so it cannot overwrite a real tenant. It is idempotent: each run replaces the generated rows.
- **Visible.** Demo sessions carry `isDemo`; the dashboard shows a banner on every page and hides controls for
  actions a demo cannot perform. The hiding is a convenience: the guard is the control.

The demo user has the `TENANT_ADMIN` role so a reviewer sees every section (billing, users, audit logs). The
read-only policy is what keeps that safe, not the role.

## Alternatives considered

- **A published demo login.** Simple, but a long-lived shared credential on a public system, and it needs a
  reset story when someone changes the password.
- **A `VIEWER` role for the demo.** Safe, but hides billing, users, audit logs and API keys, which are most of
  what there is to show.
- **Allowing disposable writes** (create a project, mint a key). A key created in the demo would work against
  the gateway and spend provider quota. Read-only is simpler to reason about and test; individual writes can
  be allow-listed later if one is worth the risk.
- **A frontend-only mock.** Cheaper, but it shows nothing about the real system; the point of the demo is that
  it is the real stack.

## Consequences

- A reviewer can explore the product in one click; nothing they do changes data.
- A second code path exists to start a session without a password. It is small, off by default, rate limited,
  audited (`DEMO_SESSION_STARTED`), and covered by end-to-end tests: disabled mode, tenant boundaries, writes
  refused, no extension on refresh, and unchanged normal authentication.
- The workspace shows generated data, which the UI says. Nobody can try the gateway with a demo key, because no
  key is revealed; running the gateway locally is the way to see a live call.
- Demo traffic from one address is limited by the address the control plane sees, so a correct proxy trust
  setting matters (`TRUST_PROXY_HOPS`, see [security](../security.md)).
