# One-shot database job: applies migrations, and optionally seeds reference data.
#
#   docker build -f infra/docker/migrate.Dockerfile -t tollbooth/migrate .
#   docker run --rm -e DATABASE_URL=... tollbooth/migrate                      # prisma migrate deploy
#   docker run --rm -e DATABASE_URL=... tollbooth/migrate seed reference       # providers, models, plans
#
# Run it once per deploy, before the application containers start, so the services never race to
# migrate. It uses `migrate deploy` (applies committed migrations only) and never `migrate dev`.
#
# The Prisma and tsx versions come from the repository's own package.json, so this image cannot drift
# from the version the migrations were written with.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine
# Prisma's engines need OpenSSL on Alpine.
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json /tmp/repo-package.json
RUN PRISMA="$(node -p "require('/tmp/repo-package.json').devDependencies.prisma")" \
 && TSX="$(node -p "require('/tmp/repo-package.json').devDependencies.tsx.replace(/^[^0-9]*/, '')")" \
 && npm init -y > /dev/null \
 && npm install --omit=dev --no-audit --no-fund "prisma@${PRISMA}" "@prisma/client@${PRISMA}" "tsx@${TSX}" \
 && npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma

COPY infra/docker/migrate-entrypoint.sh /usr/local/bin/migrate-entrypoint
RUN chmod +x /usr/local/bin/migrate-entrypoint

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
USER node
ENTRYPOINT ["migrate-entrypoint"]
CMD ["migrate"]
