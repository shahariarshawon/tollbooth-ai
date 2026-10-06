#!/usr/bin/env bash
# Brings up the production compose stack from empty volumes and checks it end to end through the
# public edge: migrations ran, every service is healthy, and each external route reaches the right place.
#
#   scripts/smoke/compose-stack.sh            # builds the images
#   NO_BUILD=1 scripts/smoke/compose-stack.sh # reuse images already built with TAG=smoke
#
# Needs Docker. Uses throwaway secrets and an isolated compose project, and removes everything on exit.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="tbsmoke-$$"
PORT="${EDGE_PORT:-18090}"
BASE="http://localhost:$PORT"
FAILURES=0

WORKDIR="$(mktemp -d)"
# A Windows docker CLI cannot resolve Git Bash /tmp paths; cygpath exists only there.
if command -v cygpath > /dev/null; then WORKDIR="$(cygpath -m "$WORKDIR")"; fi
ENV_FILE="$WORKDIR/stack.env"
cat > "$ENV_FILE" <<ENV
POSTGRES_DB=tollbooth
POSTGRES_USER=tollbooth
POSTGRES_PASSWORD=smoke-$(date +%s)
JWT_SECRET=smoke-secret-$(date +%s)-padding-to-reach-32-chars
GRAFANA_ADMIN_PASSWORD=smoke-grafana
HTTP_PORT=$PORT
DEMO_MODE=true
TAG=smoke
ENV

compose() {
  (cd "$ROOT" && docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@")
}

cleanup() {
  if [ "${KEEP_STACK:-}" != "1" ]; then compose down -v --remove-orphans > /dev/null 2>&1 || true; fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

check() {
  local label="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "1" ]; then
    printf '  ok    %s\n' "$label"
  else
    printf '  FAIL  %s%s\n' "$label" "${detail:+ ($detail)}"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "Starting the stack"
BUILD_FLAG="--build"
[ "${NO_BUILD:-}" = "1" ] && BUILD_FLAG=""
# nginx pulls in gateway, dashboard and (through them) the control plane, ai-service, redis, kafka and
# the migration job. The worker is not a dependency of anything, so it is named explicitly.
compose up -d --wait $BUILD_FLAG nginx worker > "$WORKDIR/up.log" 2>&1 \
  || { echo "stack did not become healthy:"; tail -30 "$WORKDIR/up.log"; compose ps -a; exit 1; }

echo "Database"
migrate_exit="$(docker inspect -f '{{.State.ExitCode}}' "$(compose ps -a -q migrate)")"
check "the migration job exited 0" "$([ "$migrate_exit" = "0" ] && echo 1 || echo 0)" "exit $migrate_exit"
counts="$(compose exec -T postgres psql -U tollbooth -d tollbooth -Atc \
  "select (select count(*) from ai_providers) || ',' || (select count(*) from billing_plans) || ',' || (select count(*) from users) || ',' || (select count(*) from tenants)")"
check "reference data seeded and no users or tenants created (providers,plans,users,tenants = $counts)" \
  "$([ "$counts" = "3,4,0,0" ] && echo 1 || echo 0)"

echo "Demo workspace"
compose run --rm migrate seed demo > "$WORKDIR/seed-demo.log" 2>&1   || { echo "seeding the demo failed:"; tail -20 "$WORKDIR/seed-demo.log"; exit 1; }
check "the demo seed ran" "$(grep -q 'Demo workspace ready' "$WORKDIR/seed-demo.log" && echo 1 || echo 0)"

JAR="$WORKDIR/cookies.txt"
demo_code="$(curl -s -o "$WORKDIR/demo.json" -w '%{http_code}' --max-time 15 -c "$JAR" -X POST "$BASE/api/auth/demo" || true)"
check "POST /api/auth/demo starts a session"   "$([ "$demo_code" = "200" ] && grep -q '"isDemo":true' "$WORKDIR/demo.json" && echo 1 || echo 0)" "HTTP $demo_code"
check "the browser never receives a token in the response body"   "$(grep -q -i 'accessToken\|refreshToken' "$WORKDIR/demo.json" && echo 0 || echo 1)"
check "tokens are set as httpOnly cookies"   "$([ "$(grep -c '#HttpOnly_' "$JAR")" -ge 2 ] && echo 1 || echo 0)"

overview="$(curl -sS --max-time 15 -b "$JAR" "$BASE/api/cp/dashboard/overview" -w ' [%{http_code}]')"
check "the dashboard overview is served from real data"   "$(printf '%s' "$overview" | grep -q '"requests":[1-9].*\[200\]' && echo 1 || echo 0)" "${overview:0:120}"

write="$(curl -sS --max-time 15 -b "$JAR" -X POST -H 'content-type: application/json' -d '{"name":"x"}' "$BASE/api/cp/projects" -w ' [%{http_code}]')"
check "a write in the demo workspace is refused"   "$(printf '%s' "$write" | grep -q 'disabled in the demo workspace.*\[403\]' && echo 1 || echo 0)" "$write"

echo "Configuration"
bad_config="$(compose logs --no-color 2>&1 | grep -c "Invalid environment configuration" || true)"
check "no service rejected its configuration" "$([ "$bad_config" = "0" ] && echo 1 || echo 0)"

echo "Routes through the public edge"
health="$(curl -sS --max-time 5 "$BASE/api/health")"
check "/api/health is answered by the dashboard" "$(printf '%s' "$health" | grep -q '"service":"dashboard"' && echo 1 || echo 0)" "$health"

root_code="$(curl -s -o "$WORKDIR/root.html" -w '%{http_code}' --max-time 10 "$BASE/" || true)"
check "/ serves the public landing page without a session" \
  "$([ "$root_code" = "200" ] && grep -q 'Tollbooth AI' "$WORKDIR/root.html" && echo 1 || echo 0)" "HTTP $root_code"

gateway="$(curl -sS --max-time 10 -X POST -H 'content-type: application/json' -d '{}' "$BASE/v1/chat/completions" -w ' [%{http_code}]')"
check "/v1/chat/completions reaches the gateway (OpenAI-style 401 missing_api_key)" \
  "$(printf '%s' "$gateway" | grep -q '"code":"missing_api_key".*\[401\]' && echo 1 || echo 0)" "$gateway"

login="$(curl -sS --max-time 10 -X POST -H 'content-type: application/json' \
  -d '{"email":"nobody@example.com","password":"Wrong-Passw0rd!"}' "$BASE/api/auth/login" -w ' [%{http_code}]')"
check "/api/auth/login runs dashboard -> control plane (401 from the control plane)" \
  "$(printf '%s' "$login" | grep -q 'Invalid email or password.*\[401\]' && echo 1 || echo 0)" "$login"

echo "Isolation"
if compose exec -T nginx wget -qO- -T 3 http://control-plane:3001/health > /dev/null 2>&1; then
  check "the edge cannot reach the control plane" 0 "nginx resolved control-plane"
else
  check "the edge cannot reach the control plane" 1
fi
for service in postgres redis kafka; do
  published="$(compose port "$service" 1 2> /dev/null || true)"
  check "$service publishes no host port" "$([ -z "$published" ] && echo 1 || echo 0)"
done

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES check(s) failed"
  exit 1
fi
echo "Stack smoke test passed"
