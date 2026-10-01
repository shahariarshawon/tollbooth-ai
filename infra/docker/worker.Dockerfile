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
COPY apps/worker/ ./apps/worker/
RUN pnpm --filter "./packages/*" build && pnpm --filter @tollbooth/worker build

FROM builder AS deployer
RUN pnpm --filter @tollbooth/worker --prod deploy /deploy/worker

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app
COPY --from=deployer --chown=app:app /deploy/worker ./

USER app

CMD ["node", "dist/main.js"]
