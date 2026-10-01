# Dashboard Guide

The dashboard (`apps/dashboard`) is a Next.js 16 app (App Router, React 19, TypeScript strict) using
Tailwind CSS v4, Radix-based shadcn-style components, TanStack Query, React Hook Form with Zod, Axios and
Recharts. It runs on port 3002.

```bash
pnpm install && pnpm --filter "./packages/*" build
pnpm infra:up && pnpm db:migrate && pnpm db:seed          # Postgres, Redis and sample data
PORT=3001 pnpm --filter @tollbooth/control-plane dev      # the API the dashboard talks to
pnpm --filter @tollbooth/dashboard dev                    # http://localhost:3002
```

Sign in with the seeded `admin@techcorp.com` / `ChangeMe123!`.

## Architecture in one picture

```
Browser (React)                      Dashboard server (Next.js)                 Control plane (NestJS)
-----------------                    ---------------------------                -----------------------
Axios  -> /api/cp/*  (cookies)  -->  route handler adds Bearer token   -->      /users, /tenants, ...
Axios  -> /api/auth/* (cookies) -->  login / logout / session routes   -->      /auth/login, /auth/logout
                                     refresh + retry on 401
```

The browser never sees a token. The control plane returns JWTs in JSON, so the dashboard server sits in
between (a backend-for-frontend) and keeps them in httpOnly cookies. That removes the main way a token gets
stolen, which is a script running in the page.

## Folder structure

```
src/
  app/                  Routes only. Pages are thin: metadata plus one feature component.
    login/              /login
    dashboard/          /dashboard and every section below it (layout.tsx holds the shell)
    api/auth/           login, logout, session route handlers
    api/cp/[...path]/   authenticated pass-through to the control plane
  proxy.ts              Optimistic route guard (Next.js 16 name for middleware)
  components/
    ui/                 Design system primitives (see below). No business logic.
    layout/             DashboardShell: navbar, sidebar, mobile drawer
    query-boundary.tsx  Loading / error / empty / content switch used by every page
    providers.tsx       QueryClient and auth providers
  features/             One folder per product area. Components, hooks and forms live together.
    auth/  navigation/  dashboard/  tenants/  users/  projects/  api-keys/  profile/
  services/             Axios client and one file per API area. No React in here.
    mock/               In-memory stand-in for endpoints the backend does not have yet
  hooks/                Cross-feature hooks: usePermission, useTenantScope
  lib/                  cn(), tenant-scope store, server-only helpers (lib/server)
  types/                API types shared by services and components
  utils/                Pure helpers: formatting, error messages
```

Rule of thumb: `ui` knows nothing about the product, `features` compose `ui`, `app` only wires routes to
features, `services` only talk HTTP.

### Design system (`components/ui`)

| Component                                                                   | Notes                                                          |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `Button`                                                                    | variants, sizes, `loading` prop (spinner and disabled)         |
| `Card`                                                                      | header, title, description, content, footer                    |
| `Table`                                                                     | scrolls horizontally on small screens                          |
| `Dialog`, `Modal`, `ConfirmDialog`, `FormModal`                             | `Dialog` is the Radix primitive; the others are what pages use |
| `Sheet`                                                                     | left drawer used for mobile navigation                         |
| `DropdownMenu`, `RowActions`                                                | `RowActions` is the "..." menu on table rows                   |
| `Input`, `Textarea`, `Select`, `Field`                                      | `Field` adds the label, hint and error message                 |
| `Badge`, `StatusBadge`                                                      | one status-to-colour mapping for the whole app                 |
| `Avatar`, `Tabs`, `Pagination`, `PageHeader`                                |                                                                |
| `Sidebar`, `Navbar`                                                         | presentational; the caller decides which items to show         |
| `Skeleton`, `TableSkeleton`, `CardGridSkeleton`, `EmptyState`, `ErrorState` | the shared loading, empty and error states                     |

Colours, radii and chart colours are CSS variables in `app/globals.css`; light and dark follow the OS.
Components use only those tokens, so restyling is a change to that one block.

## Routing

| Route                                                       | Who sees it (permission)                            | Data                                      |
| ----------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `/login`                                                    | everyone                                            | control plane                             |
| `/dashboard`                                                | everyone                                            | sample data, including AI provider status |
| `/dashboard/tenants`                                        | `TENANT_MANAGE` (super admin)                       | control plane                             |
| `/dashboard/users`                                          | `USER_READ`                                         | control plane                             |
| `/dashboard/projects`                                       | `PROJECT_READ`                                      | mock until backend ships                  |
| `/dashboard/api-keys`                                       | `API_KEY_CREATE`                                    | mock until backend ships                  |
| `/dashboard/profile`                                        | everyone                                            | control plane                             |
| `/dashboard/analytics`, `billing`, `audit-logs`, `settings` | `VIEW_ANALYTICS`, `VIEW_BILLING`, `MANAGE_SETTINGS` | placeholder                               |

Access is enforced in three layers:

1. `proxy.ts` redirects signed-out visitors to `/login?next=...` and signed-in ones away from `/login`. It only
   checks that a session cookie exists; it is a convenience, not security.
2. `DashboardShell` redirects to `/login` when the session query reports no user.
3. Each page wraps its content in `<Can permission=... fallback={<AccessDenied />}>`. The data hooks live inside
   the wrapped component, so no request is made for a user who cannot see the page.

The control plane re-checks every request, so hiding UI is never the protection.

## State management

There is no global client store. State is split by where it comes from:

- **Server data** (users, tenants, projects, keys, overview) is owned by TanStack Query. Query keys are
  hierarchical (`['users', tenantScope, offset]`) and mutations invalidate by prefix (`['users']`).
- **Session** is one query (`['session']`) behind `useAuth()`: `user`, `status`, `login`, `logout`.
- **Forms** are local to the dialog (React Hook Form plus a Zod schema).
- **Dialogs** are a single `dialog` state per page, for example `{ type: 'delete', user }`. A dialog is only
  mounted while open, so its form state is always fresh.
- **Tenant scope** (super admins only) is a small external store in `lib/tenant-scope.ts` read with
  `useSyncExternalStore`. It is in every tenant-scoped query key, so switching tenant never shows another
  tenant's cached data.

Default query behaviour (`components/providers.tsx`): 30 s stale time, no refetch on focus, and retries only
for network errors and 5xx, never for 4xx.

## API integration pattern

Each API area has a service file (`auth`, `tenant`, `user`, `project`, `api-key`, `dashboard`) that maps one
method to one HTTP call and returns typed data. Features never call Axios directly.

```ts
// services/user.service.ts
export const userService = {
  list: async (params) => (await http.get<Page<User>>('/users', { params })).data,
};

// features/users/hooks.ts
export const useUsers = (offset) =>
  useQuery({ queryKey: ['users', scope, offset], queryFn: () => userService.list({ offset }) });

// features/users/users-page.tsx
<QueryBoundary query={users} loading={<TableSkeleton columns={6} />} empty={<EmptyState ... />}>
  {(page) => <UsersTable users={page.data} ... />}
</QueryBoundary>
```

`services/api-client.ts` provides two Axios instances:

- `http` (`/api/cp`): sends cookies, adds `X-Tenant-Id` when a super admin selected a tenant, turns every error into
  an `ApiError { message, status, details }`, and on a final 401 signs the user out.
- `authHttp` (`/api/auth`): same error handling, but a 401 is an ordinary failure (wrong password).

Token handling lives on the server, in `app/api`:

- **Login** forwards credentials, stores tokens in cookies (`tb_at` access, `tb_rt` refresh limited to `/api`,
  `tb_user` public profile), and returns only the user.
- **Pass-through** (`/api/cp/*`) adds `Authorization: Bearer`, and when the access token is missing or rejected
  it refreshes once and retries. Refresh tokens rotate and work once, and a page fires several requests at
  once, so concurrent refreshes share a single exchange (`refreshSession`); otherwise the control plane would see
  a reused token and revoke the whole session. This is per server instance: behind several instances use sticky
  sessions or a shared lock.
- **Safety checks:** non-GET requests must come from the same origin (CSRF, on top of `SameSite=Lax`), and
  `/api/cp/auth/*` is blocked so credentials can only be issued through the dedicated routes.
- **Logout** revokes the refresh token at the control plane, then clears the cookies.

### Mocked endpoints

The backend has no projects, API keys or analytics endpoints yet. Their services are written against the
planned REST contract (`/projects`, `/api-keys`, `/api-keys/:id/rotate`, `/api-keys/:id/revoke`,
`/dashboard/overview`), and `services/mock/mock-adapter.ts` answers those paths in memory (it resets on reload).
The pages say so. To go live, implement the routes, delete `services/mock/`, and remove the adapter from
`api-client.ts` (or set `NEXT_PUBLIC_MOCK_API=false`).

### API keys are shown once

The key list type has no field for a secret. Only create and rotate return one, and it reaches the UI in a
single place: `SecretRevealDialog`. The page keeps it in state until the dialog closes, the mutation cache is
reset straight after the call so nothing else holds it, and a test checks the list never contains it.

## UI design principles

- **Minimal and quiet.** Neutral surfaces, one accent, status colour only where it carries meaning.
- **Every page has four states**, through `QueryBoundary`: skeleton while loading, error with a Try again button,
  an empty state that offers the next action, and content.
- **Destructive actions confirm.** Delete, revoke, suspend and deactivate open a `ConfirmDialog` that shows the
  backend error if the action is refused (for example removing the last admin).
- **Show only what the user can do.** Actions the role lacks are not rendered; actions that are allowed but not
  applicable (changing your own role) are disabled.
- **Forms validate early, the server decides.** Zod rules mirror the backend for fast feedback; server messages
  appear in the dialog.
- **Responsive.** Fixed 240 px sidebar from `lg`; below that a drawer opens from the menu button. Cards reflow
  from four columns to one; tables scroll horizontally inside their card; dialogs fit small screens.
- **Accessible by default.** Radix handles focus and keyboard behaviour; inputs have labels, errors use
  `role="alert"`, icon buttons have `aria-label`s, the active link has `aria-current`.

## Adding a section

1. `services/foo.service.ts` and types in `types/api.ts`.
2. `features/foo/hooks.ts` with `useQuery` and `useMutation`; put the tenant scope in the query key if the data
   is tenant scoped.
3. `features/foo/foo-page.tsx`: `<Can>` around a content component using `QueryBoundary`, `Card`, a table and
   `FormModal`/`ConfirmDialog`.
4. `app/dashboard/foo/page.tsx` (three lines) and an entry in `features/navigation/nav-items.ts` with its
   permission. Add the permission to `@tollbooth/shared` if it is new.

## Permissions

The role-to-permission matrix lives in `packages/shared/src/permissions.ts` and is imported by both the control
plane (to enforce) and the dashboard (to show or hide). It adds `PROJECT_READ` and `PROJECT_MANAGE` for the
projects UI; the control plane does not use them until the projects API exists.

| Section shown in sidebar | SUPER_ADMIN | TENANT_ADMIN | DEVELOPER | FINANCE |
| ------------------------ | :---------: | :----------: | :-------: | :-----: |
| Dashboard                |      x      |      x       |     x     |    x    |
| Tenant Management        |      x      |              |           |         |
| Users                    |      x      |      x       |           |         |
| Projects                 |      x      |      x       |     x     |    x    |
| API Keys                 |      x      |      x       |     x     |         |
| Usage Analytics          |      x      |      x       |     x     |    x    |
| Billing                  |      x      |      x       |           |    x    |
| Audit Logs, Settings     |      x      |      x       |           |         |

Super admins have no tenant. A picker in the navbar chooses the tenant that users (and later projects and keys)
operate on; without one, the Users page asks them to choose.

## Testing

```bash
pnpm --filter @tollbooth/dashboard test        # Jest + React Testing Library (jsdom)
pnpm --filter @tollbooth/dashboard typecheck
pnpm --filter @tollbooth/dashboard build
```

Covered: login form (validation, success redirect, wrong credentials, rate limit, pending state), dashboard stat
cards, sidebar visibility per role, API key table (prefix only, permission-aware actions) and the one-time
secret dialog, the permission hook and `<Can>`, `QueryBoundary` states, and the mock API contract.

## Known limitations

- Projects, API keys and dashboard numbers are mock data until the backend provides them.
- The profile name can be edited only by roles with `USER_UPDATE` (tenant admins), because the control plane has
  no self-service endpoint yet.
- Rate limits on the control plane are per IP, and it does not trust `X-Forwarded-For` (no `trust proxy`), so
  requests through this dashboard server currently share one IP. Enable `trust proxy` on the control plane when
  deploying behind it.
- Tables show a fixed set of columns and scroll sideways on phones; a card layout for narrow screens is a
  possible refinement.
- No end-to-end browser tests are committed; the flows were verified manually against the real control plane.
