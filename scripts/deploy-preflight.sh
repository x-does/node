#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
CHECK_ONLY=0

usage() {
  cat <<'EOF'
Usage: deploy-preflight.sh [--check-only]

Validates the production deployment environment for node.xdoes.space and,
by default, runs the production build plus a local runtime smoke test that
boots Next.js and verifies the live surface on localhost.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "❌ unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

preserved_workos_api_key="${WORKOS_API_KEY:-}"
preserved_workos_client_id="${WORKOS_CLIENT_ID:-}"
preserved_workos_cookie_password="${WORKOS_COOKIE_PASSWORD:-}"
preserved_workos_redirect_uri="${WORKOS_REDIRECT_URI:-}"
preserved_app_url="${APP_URL:-}"
preserved_database_url="${DATABASE_URL:-}"
preserved_db_host="${DB_HOST:-}"
preserved_db_port="${DB_PORT:-}"
preserved_db_name="${DB_NAME:-}"
preserved_db_user="${DB_USER:-}"
preserved_db_password="${DB_PASSWORD:-}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

# Restore any externally provided env so local .env placeholders don't
# clobber the real deployment credentials.
[[ -n "$preserved_workos_api_key" ]] && export WORKOS_API_KEY="$preserved_workos_api_key"
[[ -n "$preserved_workos_client_id" ]] && export WORKOS_CLIENT_ID="$preserved_workos_client_id"
[[ -n "$preserved_workos_cookie_password" ]] && export WORKOS_COOKIE_PASSWORD="$preserved_workos_cookie_password"
[[ -n "$preserved_workos_redirect_uri" ]] && export WORKOS_REDIRECT_URI="$preserved_workos_redirect_uri"
[[ -n "$preserved_app_url" ]] && export APP_URL="$preserved_app_url"
[[ -n "$preserved_database_url" ]] && export DATABASE_URL="$preserved_database_url"
[[ -n "$preserved_db_host" ]] && export DB_HOST="$preserved_db_host"
[[ -n "$preserved_db_port" ]] && export DB_PORT="$preserved_db_port"
[[ -n "$preserved_db_name" ]] && export DB_NAME="$preserved_db_name"
[[ -n "$preserved_db_user" ]] && export DB_USER="$preserved_db_user"
[[ -n "$preserved_db_password" ]] && export DB_PASSWORD="$preserved_db_password"

print_git_context() {
  if [[ ! -d "$ROOT_DIR/.git" ]]; then
    echo "⚠️  git context unavailable (no .git directory)"
    return 0
  fi

  local branch head status dirty
  branch="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  head="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || true)"
  status="$(git -C "$ROOT_DIR" status --short --branch 2>/dev/null || true)"
  dirty="$(git -C "$ROOT_DIR" status --short 2>/dev/null || true)"

  if [[ -n "$branch" || -n "$head" ]]; then
    echo "✅ git context: ${branch:-unknown}@${head:-unknown}"
  fi

  if [[ -n "$status" ]]; then
    echo "== Git status =="
    echo "$status"
  fi

  if [[ -z "$dirty" ]]; then
    echo "✅ working tree clean"
  else
    echo "⚠️  working tree is dirty"
  fi
}

build_fingerprint() {
  local head version
  head="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  version="$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)"
  printf '%s|%s|%s|%s' "${APP_URL:-unknown}" "${NODE_ENV:-unknown}" "$version" "$head"
}

find_free_port() {
  python3 - <<'PY'
import socket
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
print(sock.getsockname()[1])
sock.close()
PY
}

cleanup_server() {
  if [[ -n "${SMOKE_SERVER_PID:-}" ]]; then
    kill "${SMOKE_SERVER_PID}" 2>/dev/null || true
    wait "${SMOKE_SERVER_PID}" 2>/dev/null || true
    SMOKE_SERVER_PID=""
  fi
}

run_local_runtime_smoke() {
  local port base_url server_log status body attempt
  port="$(find_free_port)"
  base_url="http://127.0.0.1:${port}"
  server_log="$(mktemp "${ROOT_DIR}/.deploy-preflight-next-start.XXXXXX.log")"
  body="$(mktemp "${ROOT_DIR}/.deploy-preflight-health.XXXXXX.body")"

  echo "== Local runtime smoke =="
  echo "✅ starting Next.js on ${base_url}"

  trap cleanup_server EXIT

  (cd "$ROOT_DIR" && npm run start -- -H 127.0.0.1 -p "$port" >"$server_log" 2>&1) &
  SMOKE_SERVER_PID=$!

  attempt=1
  while (( attempt <= 30 )); do
    if ! kill -0 "$SMOKE_SERVER_PID" 2>/dev/null; then
      echo "❌ Next.js exited before smoke checks completed"
      sed -n '1,200p' "$server_log" || true
      exit 1
    fi

    status="$(curl -sS -o "$body" -w '%{http_code}' --connect-timeout 2 --max-time 5 "${base_url}/api/health" 2>/dev/null || true)"
    if [[ "$status" == "200" ]]; then
      echo "✅ /api/health returned 200 on local runtime"
      if ! grep -Fq '"ok":true' "$body"; then
        echo "❌ /api/health body missing ok flag"
        sed -n '1,200p' "$body" || true
        exit 1
      fi
      echo "✅ runtime health body includes ok=true"
      echo "✅ runtime smoke passed"
      return 0
    fi

    if [[ "$status" == "500" ]]; then
      echo "❌ /api/health returned 500 on local runtime; failing fast"
      sed -n '1,120p' "$body" || true
      echo "---- Next.js log ----"
      sed -n '1,200p' "$server_log" || true
      exit 1
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  echo "❌ timed out waiting for local Next.js runtime to answer on ${base_url}"
  sed -n '1,200p' "$server_log" || true
  exit 1
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "❌ missing required env var: ${name}"
    exit 1
  fi
}

require_any_db_config() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    return 0
  fi

  local missing=0
  for name in DB_HOST DB_NAME DB_USER DB_PASSWORD; do
    if [[ -z "${!name:-}" ]]; then
      missing=1
      echo "❌ missing required legacy DB env var: ${name}"
    fi
  done

  if [[ "$missing" -ne 0 ]]; then
    exit 1
  fi
}

check_node_env() {
  if [[ "${NODE_ENV:-}" != "production" ]]; then
    echo "❌ NODE_ENV must be production for a deploy preflight (got: ${NODE_ENV:-<unset>})"
    exit 1
  fi
}

check_redirect_uri() {
  if [[ -z "${WORKOS_REDIRECT_URI:-}" ]]; then
    echo "⚠️  WORKOS_REDIRECT_URI is unset (expected on some local setups)"
    return 0
  fi

  case "$WORKOS_REDIRECT_URI" in
    https://node.xdoes.space/api/auth/callback|http://localhost:3000/api/auth/callback) ;;
    *)
      echo "⚠️  WORKOS_REDIRECT_URI is set to an unexpected value: ${WORKOS_REDIRECT_URI}"
      ;;
  esac
  if [[ -n "${WORKOS_REDIRECT_URI:-}" ]]; then
    echo "✅ WORKOS_REDIRECT_URI=${WORKOS_REDIRECT_URI}"
  fi
}

echo "== Deploy preflight for node.xdoes.space =="
require_any_db_config
require_var APP_URL
check_redirect_uri

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "✅ database config: DATABASE_URL present"
else
  echo "✅ database config: legacy DB_HOST/DB_NAME/DB_USER/DB_PASSWORD present"
fi

missing_workos=0
for name in WORKOS_API_KEY WORKOS_CLIENT_ID WORKOS_COOKIE_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then
    missing_workos=1
    echo "⚠️  missing non-local WorkOS env var: ${name}"
  fi
done
if [[ "${missing_workos}" -eq 0 ]]; then
  echo "✅ WorkOS env present"
fi

if [[ -z "${NODE_ENV:-}" ]]; then
  NODE_ENV=production
  export NODE_ENV
  echo "⚠️  NODE_ENV unset; defaulting to production for preflight"
else
  check_node_env
fi

echo "✅ APP_URL=${APP_URL}"
echo "✅ NODE_ENV=${NODE_ENV}"
print_git_context
echo "✅ build fingerprint: $(build_fingerprint)"

echo "== Prisma client generation =="
(cd "$ROOT_DIR" && npm run db:generate)

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  echo "✅ deploy preflight checks passed (build skipped by --check-only)"
  exit 0
fi

echo "== Production build =="
(cd "$ROOT_DIR" && npm run build)

run_local_runtime_smoke

echo "🎉 deploy preflight passed"
