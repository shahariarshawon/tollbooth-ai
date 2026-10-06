#!/usr/bin/env bash
# Verifies the public edge routing by running the real infra/nginx/nginx.conf in front of three stub
# upstreams: gateway, dashboard, and a decoy control plane that must never receive a request.
#
#   scripts/smoke/nginx-routing.sh
#
# Needs Docker. Exits non-zero on the first wrong route.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${NGINX_IMAGE:-nginx:1.27-alpine}"
PREFIX="tb-routing-$$"
NETWORK="$PREFIX-net"
EDGE_PORT="${EDGE_PORT:-18080}"
FAILURES=0

cleanup() {
  docker rm -f "$PREFIX-edge" "$PREFIX-gateway" "$PREFIX-dashboard" "$PREFIX-control-plane" > /dev/null 2>&1 || true
  docker network rm "$NETWORK" > /dev/null 2>&1 || true
}
# A stub answers every path with its own name, the request URI and the headers it received.
WORKDIR="$(mktemp -d)"
trap 'cleanup; rm -rf "$WORKDIR"' EXIT

start_stub() {
  local name="$1" port="$2"
  cat > "$WORKDIR/$name.conf" <<CONF
server {
  listen $port;
  location / {
    default_type application/json;
    return 200 '{"upstream":"$name","uri":"\$request_uri","xff":"\$http_x_forwarded_for","rid":"\$http_x_request_id"}';
  }
}
CONF
  docker create --name "$PREFIX-$name" --network "$NETWORK" --network-alias "$name" "$IMAGE" > /dev/null
  # Relative paths from inside the directory: a Windows docker CLI cannot resolve Git Bash /tmp paths.
  (cd "$WORKDIR" && docker cp "$name.conf" "$PREFIX-$name:/etc/nginx/conf.d/default.conf")
  docker start "$PREFIX-$name" > /dev/null
}

docker network create "$NETWORK" > /dev/null
start_stub gateway 3000
start_stub dashboard 3002
start_stub control-plane 3001

# The edge under test: the real config, with the compose stack's upstream names.
docker create --name "$PREFIX-edge" --network "$NETWORK" -p "$EDGE_PORT:80" "$IMAGE" > /dev/null
(
  cd "$ROOT/infra/nginx"
  docker cp nginx.conf "$PREFIX-edge:/etc/nginx/nginx.conf"
  docker cp upstreams.compose.conf "$PREFIX-edge:/etc/nginx/upstreams.conf"
)
docker start "$PREFIX-edge" > /dev/null

for _ in $(seq 1 30); do
  curl -fsS "http://localhost:$EDGE_PORT/nginx-health" > /dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS "http://localhost:$EDGE_PORT/nginx-health" > /dev/null \
  || { echo "edge did not start:"; docker logs "$PREFIX-edge"; exit 1; }

docker exec "$PREFIX-edge" nginx -t > /dev/null 2>&1 || { echo "nginx -t failed"; exit 1; }

# expect_upstream <method> <path> <expected upstream>
expect_upstream() {
  local method="$1" path="$2" expected="$3" body actual
  body="$(curl -sS -X "$method" --max-time 5 "http://localhost:$EDGE_PORT$path")"
  actual="$(printf '%s' "$body" | sed -n 's/.*"upstream":"\([^"]*\)".*/\1/p')"
  if [ "$actual" = "$expected" ]; then
    printf '  ok    %-5s %-28s -> %s\n' "$method" "$path" "$actual"
  else
    printf '  FAIL  %-5s %-28s -> %s (expected %s)\n' "$method" "$path" "${actual:-<no upstream>}" "$expected"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "Routing"
expect_upstream POST /v1/chat/completions gateway
expect_upstream GET  /v1/models gateway
expect_upstream POST /api/auth/login dashboard
expect_upstream POST /api/auth/demo dashboard
expect_upstream GET  /api/cp/projects dashboard
expect_upstream GET  /api/cp/dashboard/overview dashboard
expect_upstream GET  /api/health dashboard
expect_upstream GET  / dashboard
expect_upstream GET  /dashboard dashboard
expect_upstream GET  /login dashboard
# Operational endpoints of the backends are not part of the public surface.
expect_upstream GET  /health dashboard
expect_upstream GET  /metrics dashboard
expect_upstream GET  /health/gateway dashboard
expect_upstream GET  /health/control-plane dashboard
expect_upstream GET  /auth/login dashboard

echo "Control plane stays private"
hits="$(docker logs "$PREFIX-control-plane" 2>&1 | grep -c -E '"(GET|POST|PUT|PATCH|DELETE|HEAD) ' || true)"
if [ "$hits" = "0" ]; then
  echo "  ok    the control plane received 0 requests"
else
  echo "  FAIL  the control plane received $hits request(s)"
  FAILURES=$((FAILURES + 1))
fi

echo "Client address"
spoofed="$(curl -sS --max-time 5 -H 'X-Forwarded-For: 6.6.6.6' "http://localhost:$EDGE_PORT/v1/models")"
if printf '%s' "$spoofed" | grep -q '6\.6\.6\.6'; then
  echo "  FAIL  a client-supplied X-Forwarded-For reached the gateway: $spoofed"
  FAILURES=$((FAILURES + 1))
else
  echo "  ok    a spoofed X-Forwarded-For is replaced by the connection address"
fi

echo "Request correlation"
supplied="$(curl -sS --max-time 5 -H 'X-Request-ID: client-id-12345678' "http://localhost:$EDGE_PORT/v1/models")"
generated="$(curl -sS --max-time 5 "http://localhost:$EDGE_PORT/v1/models")"
if printf '%s' "$supplied" | grep -q '"rid":"client-id-12345678"'; then
  echo "  ok    a caller's request id is passed through"
else
  echo "  FAIL  caller request id not preserved: $supplied"
  FAILURES=$((FAILURES + 1))
fi
if printf '%s' "$generated" | grep -q -E '"rid":"[0-9a-f]{32}"'; then
  echo "  ok    an id is generated when the caller sends none"
else
  echo "  FAIL  no request id generated: $generated"
  FAILURES=$((FAILURES + 1))
fi

echo "Rate limits"
limited=0
for _ in $(seq 1 40); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST --max-time 5 "http://localhost:$EDGE_PORT/api/auth/login" || true)"
  if [ "$code" = "429" ]; then limited=$((limited + 1)); fi
done
if [ "$limited" -gt 0 ]; then
  echo "  ok    /api/auth/ is rate limited ($limited of 40 rapid requests refused with 429)"
else
  echo "  FAIL  /api/auth/ accepted 40 rapid requests"
  FAILURES=$((FAILURES + 1))
fi

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES check(s) failed"
  exit 1
fi
echo "All edge routing checks passed"
