#!/bin/sh
# Entry point of the migrate image.
#
#   migrate               apply committed migrations (prisma migrate deploy)
#   seed reference        seed providers, models and billing plans (idempotent, never overwrites)
#   seed demo             seed the demo workspace (idempotent; see docs/deployment.md)
#   migrate-and-seed      migrate, then seed reference data: what a fresh deploy runs
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

case "${1:-migrate}" in
  migrate)
    exec npx prisma migrate deploy --schema prisma/schema.prisma
    ;;
  seed)
    shift
    exec npx tsx prisma/seed/index.ts "$@"
    ;;
  migrate-and-seed)
    npx prisma migrate deploy --schema prisma/schema.prisma
    exec npx tsx prisma/seed/index.ts reference
    ;;
  *)
    echo "Unknown command: $1 (use migrate, seed <target>, or migrate-and-seed)" >&2
    exit 64
    ;;
esac
