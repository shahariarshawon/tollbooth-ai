# One image definition for the NestJS services (gateway, control-plane, worker):
#
#   docker build -f infra/docker/node-service.Dockerfile \
#     --build-arg SERVICE=gateway --build-arg PORT=3000 -t tollbooth/gateway .
#
# PORT is the default listening port (gateway 3000, control-plane 3001, worker 3003); the container
# can still override it at run time.
#
# Build context is the repository root. Three stages:
#   builder  full install of the service's dependency closure, then compile
#   prod     production-only install, Prisma client generated, compiled output copied in
#   runner   the prod stage's files on a clean base image, running as an unprivileged user

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# The pnpm version is pinned by "packageManager" in package.json.
RUN corepack enable
WORKDIR /repo

# Manifests first, so dependency layers are cached until a lockfile or manifest changes.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/config/package.json    packages/config/
COPY packages/database/package.json  packages/database/
COPY packages/kafka/package.json     packages/kafka/
COPY packages/shared/package.json    packages/shared/
COPY apps/gateway/package.json       apps/gateway/
COPY apps/control-plane/package.json apps/control-plane/
COPY apps/worker/package.json        apps/worker/
COPY apps/dashboard/package.json     apps/dashboard/

FROM manifests AS builder
ARG SERVICE
ARG PORT
RUN test -n "$SERVICE" && test -n "$PORT" \
 || (echo "Pass --build-arg SERVICE=gateway|control-plane|worker and --build-arg PORT=<port>" && false)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@tollbooth/${SERVICE}..."
# packages/database runs `prisma generate` against this schema as part of its build.
COPY prisma/schema.prisma prisma/schema.prisma
COPY packages packages
COPY apps/${SERVICE} apps/${SERVICE}
RUN pnpm --filter "@tollbooth/${SERVICE}..." build
# Keep only the compiled output of the packages this service uses.
RUN mkdir /out \
 && for dir in packages/* apps/${SERVICE}; do \
      if [ -d "$dir/dist" ]; then mkdir -p "/out/$dir" && cp -r "$dir/dist" "/out/$dir/"; fi; \
    done

FROM manifests AS prod
ARG SERVICE
RUN --mount=type=cache,id=pnpm,target=/pnpm/store     pnpm install --frozen-lockfile --prod --filter "@tollbooth/${SERVICE}..."
COPY prisma/schema.prisma prisma/schema.prisma
# The generated Prisma client lives inside node_modules, so a fresh production install needs its own. The
# CLI that generates it is installed outside /repo, so it never reaches the runtime image. Prisma finds
# @prisma/client relative to the schema, so the schema is generated from inside the database package.
# Services that do not use the database (the worker today) never install the package: nothing to do.
RUN if [ -d packages/database/node_modules ]; then       PRISMA="$(node -p "require('./package.json').devDependencies.prisma")"       && npm install --prefix /opt/prisma-cli --no-audit --no-fund "prisma@${PRISMA}"       && cp prisma/schema.prisma packages/database/schema.prisma       && cd packages/database       && PRISMA_GENERATE_SKIP_AUTOINSTALL=true node /opt/prisma-cli/node_modules/prisma/build/index.js generate --schema schema.prisma       && rm schema.prisma;     fi
COPY --from=builder /out/ ./

FROM node:${NODE_VERSION}-alpine AS runner
ARG SERVICE
ARG PORT
ENV NODE_ENV=production \
    PORT=${PORT}
# Prisma's query engine needs OpenSSL on Alpine.
RUN apk add --no-cache openssl
WORKDIR /repo
COPY --from=prod /repo /repo
WORKDIR /repo/apps/${SERVICE}

# The built-in unprivileged user (uid 1000) owns nothing: the application only reads its files.
USER node

# Every service answers GET /health on PORT. 127.0.0.1 rather than localhost, because busybox wget
# may resolve localhost to ::1 while the server listens on IPv4.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["node", "dist/main.js"]
