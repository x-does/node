#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3010}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
START_SERVER="${START_SERVER:-1}"
BUILD_FIRST="${BUILD_FIRST:-1}"
SERVER_LOG="${SERVER_LOG:-$(mktemp)}"
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -f "${SERVER_LOG}"
}
trap cleanup EXIT

report_server_blocker() {
  local reason="$1"
  echo "❌ local audit regression blocked: ${reason}"
  if [[ -f "${SERVER_LOG}" ]]; then
    echo "---- server log ----"
    sed -n '1,200p' "${SERVER_LOG}"
  fi
  exit 1
}

wait_for_server() {
  local attempt=1
  while (( attempt <= 60 )); do
    if curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
      return 0
    fi

    if [[ -f "${SERVER_LOG}" ]]; then
      if grep -Fq "Can't reach database server at" "${SERVER_LOG}"; then
        report_server_blocker "database unreachable for the local health check"
      fi
      if grep -Fq "PrismaClientInitializationError" "${SERVER_LOG}"; then
        report_server_blocker "Prisma failed during health startup"
      fi
      if grep -Fq "UnhandledRuntimeError" "${SERVER_LOG}"; then
        report_server_blocker "the local server crashed during startup"
      fi
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  report_server_blocker "the local server did not become healthy at ${BASE_URL}"
}

if [[ "${START_SERVER}" == "1" ]]; then
  if [[ "${BUILD_FIRST}" == "1" ]]; then
    npm run build
  fi

  npm run start -- --hostname 127.0.0.1 --port "${PORT}" >"${SERVER_LOG}" 2>&1 &
  SERVER_PID=$!
  wait_for_server
fi

bash scripts/verify-live-audit-surface.sh \
  --base-url "${BASE_URL}" \
  --skip-click \
  --skip-root

echo "✅ local audit regression passed on ${BASE_URL}"
