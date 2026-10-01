FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS installer
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/config/package.json       ./packages/config/
COPY packages/database/package.json     ./packages/database/
COPY packages/kafka/package.json        ./packages/kafka/
COPY packages/shared/package.json       ./packages/shared/
COPY apps/gateway/package.json          ./apps/gateway/
COPY apps/control-plane/package.json    ./apps/control-plane/
COPY apps/worker/package.json           ./apps/worker/
COPY apps/dashboard/package.json        ./apps/dashboard/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM installer AS builder
COPY packages/ ./packages/
COPY apps/dashboard/ ./apps/dashboard/
# Build time env vars required by Next.js for static generation
ARG NEXT_PUBLIC_MOCK_API=false
ENV NEXT_PUBLIC_MOCK_API=$NEXT_PUBLIC_MOCK_API
RUN pnpm --filter "./packages/*" build && pnpm --filter @tollbooth/dashboard build

# ── Runtime image — uses Next.js standalone output ────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

# Standalone output is self-contained: server.js + static assets
COPY --from=builder --chown=app:app /repo/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=app:app /repo/apps/dashboard/.next/static     ./apps/dashboard/.next/static
COPY --from=builder --chown=app:app /repo/apps/dashboard/public           ./apps/dashboard/public

USER app
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s \
  CMD wget -qO- http://localhost:3002/api/health 2>/dev/null || wget -qO- http://localhost:3002/ || exit 1

# Next.js standalone server
CMD ["node", "apps/dashboard/server.js"]
