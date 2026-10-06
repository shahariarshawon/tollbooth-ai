# The Next.js dashboard and its server-side BFF routes.
#
#   docker build -f infra/docker/dashboard.Dockerfile -t tollbooth/dashboard .
#
# Next.js "standalone" output is a self-contained server with only the files it traced, so the runtime
# image needs no node_modules install. Server-side settings (CONTROL_PLANE_URL, DEMO_MODE) are read at
# run time, never baked into the build.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/config/package.json    packages/config/
COPY packages/database/package.json  packages/database/
COPY packages/kafka/package.json     packages/kafka/
COPY packages/shared/package.json    packages/shared/
COPY apps/gateway/package.json       apps/gateway/
COPY apps/control-plane/package.json apps/control-plane/
COPY apps/worker/package.json        apps/worker/
COPY apps/dashboard/package.json     apps/dashboard/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@tollbooth/dashboard..."
COPY packages/shared packages/shared
COPY apps/dashboard apps/dashboard
# Builds @tollbooth/shared (the permission matrix), then the dashboard.
RUN pnpm --filter "@tollbooth/dashboard..." build

FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production \
    PORT=3002 \
    # The container's own hostname is the default, which would leave the server unreachable on 127.0.0.1.
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder /repo/apps/dashboard/.next/standalone ./
COPY --from=builder /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static

USER node
EXPOSE 3002

# /api/health is answered by the dashboard itself and does not depend on the control plane.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

CMD ["node", "apps/dashboard/server.js"]
