# Authentication, Authorization and Tenancy

Control plane API (`apps/control-plane`). Base URL in development: `http://localhost:3001`.

Every route requires a valid access token except `GET /health` and the `/auth/*` routes.

## Authentication flow

```
 Client                               Control plane                         Postgres / Redis
   |  POST /auth/register                   |                                      |
   |--------------------------------------->| create tenant + TENANT_ADMIN (bcrypt)|
   |  POST /auth/login {email,password}     |                                      |
   |--------------------------------------->| rate limit (Redis) -> verify bcrypt  |
   |<---------------------------------------| access JWT (15m) + refresh token     |
   |                                        |                                      |
   |  GET /users   Authorization: Bearer <access>                                  |
   |--------------------------------------->| verify JWT -> load user+tenant (DB)  |
   |                                        | -> tenant context -> permission check|
   |<---------------------------------------|                                      |
   |                                        |                                      |
   |  POST /auth/refresh {refreshToken}     |                                      |
   |--------------------------------------->| revoke presented token, issue new one|
   |<---------------------------------------| new access JWT + new refresh token   |
```

Each request passes three global guards, in order:

1. **JwtAuthGuard** verifies the signature, algorithm (HS256 only), issuer and expiry, then reloads the
   user from the database. Disabled users and users of suspended or deleted tenants are rejected.
2. **TenantContextGuard** decides which tenant the request acts on (see Tenant isolation).
3. **RolesGuard** enforces `@RequirePermission(...)`.

## Endpoints

### `POST /auth/register`

Self-service sign-up. Creates a tenant (FREE plan) and its first user, a `TENANT_ADMIN`. Rate limited to
10 per hour per IP.

```bash
curl -X POST localhost:3001/auth/register -H 'content-type: application/json' -d '{
  "email": "ada@acme.com",
  "password": "Sup3rSecret",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "companyName": "Acme Inc",
  "tenantSlug": "acme"
}'
```

`201 Created`

```json
{
  "user": {
    "id": "5b0c...",
    "tenantId": "9e3c...",
    "email": "ada@acme.com",
    "role": "TENANT_ADMIN",
    "status": "ACTIVE"
  },
  "tenant": { "id": "9e3c...", "companyName": "Acme Inc", "slug": "acme", "plan": "FREE" }
}
```

Errors: `400` validation, `409` email or slug already taken.

### `POST /auth/login`

```bash
curl -X POST localhost:3001/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@techcorp.com","password":"ChangeMe123!"}'
```

`200 OK`

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "q3Zb1cYc0n...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "471d...",
    "tenantId": "9e3c...",
    "email": "admin@techcorp.com",
    "firstName": "Ada",
    "lastName": "Admin",
    "role": "TENANT_ADMIN"
  }
}
```

`expiresIn` is the access token lifetime in seconds. Errors: `401 Invalid email or password` for every
failure cause (unknown email, wrong password, disabled user, inactive tenant), `429` when rate limited.

### `POST /auth/refresh`

Body: `{ "refreshToken": "..." }`. Returns the same shape as login with a **new** refresh token. The
presented token stops working immediately. Errors: `401 Invalid refresh token`.

### `POST /auth/logout`

Body: `{ "refreshToken": "..." }`. Revokes that session. Always `204`, even for unknown tokens.

### Users (tenant scoped)

| Method | Path         | Permission    | Notes                                                           |
| ------ | ------------ | ------------- | --------------------------------------------------------------- |
| GET    | `/users`     | `USER_READ`   | Paginated: `?limit=1..100&offset=0`                             |
| GET    | `/users/:id` | `USER_READ`   | 404 for users of other tenants                                  |
| POST   | `/users`     | `USER_CREATE` | Creates an `INVITED` user with a temporary password             |
| PATCH  | `/users/:id` | `USER_UPDATE` | `firstName`, `lastName`, `role`, `status` (`ACTIVE`/`DISABLED`) |
| DELETE | `/users/:id` | `USER_DELETE` | `204`                                                           |

Rules: `SUPER_ADMIN` cannot be assigned through the API; you cannot change your own role or status or
delete yourself; a tenant must keep at least one active `TENANT_ADMIN` (`409` otherwise). Disabling a
user revokes their refresh tokens. An invited user becomes `ACTIVE` on first successful login.

### Tenants

| Method | Path           | Permission        | Notes                                                                 |
| ------ | -------------- | ----------------- | --------------------------------------------------------------------- |
| GET    | `/tenants`     | `TENANT_MANAGE`   | Paginated                                                             |
| POST   | `/tenants`     | `TENANT_MANAGE`   | `companyName`, `slug`, optional `plan`                                |
| GET    | `/tenants/:id` | any authenticated | Own tenant only; super admin may read any                             |
| PATCH  | `/tenants/:id` | `MANAGE_SETTINGS` | Tenant admins: `companyName` only. Super admin: also `plan`, `status` |
| DELETE | `/tenants/:id` | `TENANT_MANAGE`   | Soft delete (`status = DELETED`), revokes all sessions                |

Tenant status: `ACTIVE`, `SUSPENDED`, `DELETED`. Users of a non-active tenant cannot sign in, and their
existing tokens stop working immediately.

## JWT structure

Access tokens are HS256 JWTs signed with `JWT_SECRET`.

```json
{
  "sub": "471d64d1-885c-4d3b-9fb5-2d9a736ff14b",
  "userId": "471d64d1-885c-4d3b-9fb5-2d9a736ff14b",
  "tenantId": "9e3caef8-1e36-4929-b70e-7788a9ec7425",
  "role": "TENANT_ADMIN",
  "iss": "tollbooth-control-plane",
  "iat": 1790000000,
  "exp": 1790000900
}
```

- `sub` is the standard subject claim; `userId` repeats it for convenience. `tenantId` is `null` for
  `SUPER_ADMIN`.
- **The token identifies the user; it is not the source of truth.** On every request the user, tenant
  status and role are re-read from the database. Changing a role, disabling a user or suspending a tenant
  takes effect on the next request, not when the token expires. A token whose `tenantId` does not match
  the user's tenant is rejected.
- Verification pins the algorithm to HS256 (so `alg: none` and algorithm-confusion attacks fail) and checks
  issuer and expiry.

## Refresh tokens

- Opaque random values (384 bits), not JWTs. Only their SHA-256 hash is stored in `refresh_tokens`.
- **Rotation:** each refresh revokes the presented token and issues a new one in the same _family_. The
  revocation is a single conditional update, so two concurrent requests cannot both succeed.
- **Reuse detection:** presenting an already-used token means it was replayed or stolen. The entire family
  is revoked (the legitimate holder must log in again) and a `TOKEN_REUSE_DETECTED` audit event is written.
- Expiry: `JWT_REFRESH_EXPIRE` (default 7 days) from issue. Logout, user disable, user delete and tenant
  delete revoke tokens.

## RBAC

Roles are a column on the user. Each role maps to a fixed set of permissions in
`apps/control-plane/src/roles/permission.ts`.

Permissions:

| Permission        | Meaning                                             |
| ----------------- | --------------------------------------------------- |
| `TENANT_MANAGE`   | List, create, delete any tenant; change plan/status |
| `MANAGE_SETTINGS` | Change settings of the own tenant                   |
| `USER_READ`       | List and read users in the tenant                   |
| `USER_CREATE`     | Invite users                                        |
| `USER_UPDATE`     | Change names, roles, status of users                |
| `USER_DELETE`     | Remove users                                        |
| `API_KEY_CREATE`  | Create API keys (used from the next phase)          |
| `API_KEY_DELETE`  | Revoke API keys (used from the next phase)          |
| `VIEW_ANALYTICS`  | See usage analytics (used from a later phase)       |
| `VIEW_BILLING`    | See cost and billing data (used from a later phase) |

Matrix:

| Permission        | SUPER_ADMIN | TENANT_ADMIN | DEVELOPER | FINANCE |
| ----------------- | :---------: | :----------: | :-------: | :-----: |
| `TENANT_MANAGE`   |      x      |              |           |         |
| `MANAGE_SETTINGS` |      x      |      x       |           |         |
| `USER_READ`       |      x      |      x       |           |         |
| `USER_CREATE`     |      x      |      x       |           |         |
| `USER_UPDATE`     |      x      |      x       |           |         |
| `USER_DELETE`     |      x      |      x       |           |         |
| `API_KEY_CREATE`  |      x      |      x       |     x     |         |
| `API_KEY_DELETE`  |      x      |      x       |     x     |         |
| `VIEW_ANALYTICS`  |      x      |      x       |     x     |    x    |
| `VIEW_BILLING`    |      x      |      x       |           |    x    |

Usage:

```ts
@Post()
@RequirePermission(Permission.USER_CREATE)
create(...) {}
```

`@RequirePermission` with several permissions requires all of them. A route with no decorator needs only a
valid token; routes are closed by default because the JWT guard is global, and a public route must opt out
explicitly with `@Public()`.

## Tenant isolation

- Tenant users always act on the tenant stored on their own user record. The JWT claim is never trusted for
  this.
- Every users query includes `tenantId`. A user id from another tenant returns `404`, identical to a
  missing id, so ids cannot be used to probe other tenants.
- Tenant users who send an `X-Tenant-Id` header naming another tenant get `403`.
- `SUPER_ADMIN` has no tenant. For tenant-scoped routes it must select one with `X-Tenant-Id: <tenant uuid>`;
  without the header those routes return `403`.
- The database backs this up: composite foreign keys stop rows referencing another tenant's project or key.

## Security features

- **Passwords:** minimum 8 characters with an uppercase letter, a lowercase letter and a number; maximum 72
  (the bcrypt limit). Hashed with bcrypt (`BCRYPT_ROUNDS`, default 12). Never logged, returned or audited.
- **Brute-force protection** (Redis, fixed window, keys hashed):

  | Route            | Per IP      | Per email  |
  | ---------------- | ----------- | ---------- |
  | `/auth/login`    | 30 / 15 min | 5 / 15 min |
  | `/auth/register` | 10 / hour   |            |
  | `/auth/refresh`  | 60 / 15 min |            |
  | `/auth/logout`   | 60 / 15 min |            |

  Exceeding a limit returns `429` with `Retry-After`. Attempts are counted whether or not they succeed. If
  Redis is unreachable the route fails closed with `503` rather than running unprotected.

- **Uniform failures:** login returns the same message for all causes and always runs a bcrypt comparison, so
  neither content nor timing reveals whether an email exists.
- **Validation:** unknown properties are rejected (`400`), which blocks mass assignment such as sending
  `role`.
- **Errors:** every failure has the shape `{ "statusCode", "message", "error" }`. Database errors and
  stack traces are logged on the server and never sent; unexpected errors return
  `500 Internal server error`.

## Audit events

Written to `audit_logs` (in the same transaction as the change where there is one):

| Action                                               | When                                                 |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `LOGIN_SUCCESS`                                      | Successful login                                     |
| `LOGIN_FAILED`                                       | Any failed login; `metadata.reason` says why         |
| `TOKEN_REUSE_DETECTED`                               | A rotated refresh token was presented again          |
| `USER_CREATED`                                       | User created, or registered through `/auth/register` |
| `USER_UPDATED`                                       | User fields changed; `metadata.fields` lists which   |
| `ROLE_CHANGED`                                       | Role changed; `metadata` has `from` and `to`         |
| `USER_DELETED`                                       | User removed                                         |
| `TENANT_CREATED`, `TENANT_UPDATED`, `TENANT_DELETED` | Tenant lifecycle                                     |

Each row records the actor (`userId`), `tenantId`, `ipAddress` and time. Failed logins for unknown emails have
a null tenant and keep the attempted email in `metadata`.

## Configuration

| Variable             | Default | Notes                                  |
| -------------------- | ------- | -------------------------------------- |
| `JWT_SECRET`         | none    | Required, at least 32 characters       |
| `JWT_ACCESS_EXPIRE`  | `15m`   | Number plus `s`, `m`, `h` or `d`       |
| `JWT_REFRESH_EXPIRE` | `7d`    | Same format                            |
| `BCRYPT_ROUNDS`      | `12`    | 10 to 15                               |
| `REDIS_URL`          | none    | Required; backs the login rate limiter |

## Known limitations

- No password change or reset, email verification, or emailed invitation yet. Invited users receive a
  temporary password from the admin.
- Behind a reverse proxy, configure Express `trust proxy`, otherwise rate limiting and audit IPs see the
  proxy address.
- Expired refresh tokens are not purged yet; a worker job should delete them.
- `X-Tenant-Id` impersonation by `SUPER_ADMIN` is audited through the actor on each action but has no
  dedicated event.
