#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://node.xdoes.space"
EVENT_KEY="node_audit_20260328"
PARITY_MARKER=""
SKIP_CLICK=0
SRC=""
RETRIES=3
RETRY_DELAY_MS=1200
CURL_CONNECT_TIMEOUT=8
CURL_MAX_TIME=20

usage() {
  cat <<'EOF'
Usage: verify-live-audit-surface.sh [options] [base_url] [event_key]

Options:
  --base-url <url>         Verification target (default: https://node.xdoes.space)
  --event-key <key>        Audit event key for click redirect check (default: node_audit_20260328)
  --parity-marker <txt>    Expected root parity marker (default: read from /api/health parityMarker)
  --source <src>           Source value for /api/audit-click probe (default: verify_script_<ts>)
  --skip-click             Read-only mode: skip /api/audit-click probe to avoid creating metrics events
  --retries <n>            Number of fetch attempts per endpoint (default: 3)
  --retry-delay-ms <ms>    Delay between retries in milliseconds (default: 1200)
  --connect-timeout <sec>  Curl connect timeout in seconds (default: 8)
  --max-time <sec>         Curl total timeout per request in seconds (default: 20)
  -h, --help               Show this help

Positional args remain supported for backward compatibility:
  1st positional arg: base_url
  2nd positional arg: event_key
EOF
}

POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --event-key)
      EVENT_KEY="$2"
      shift 2
      ;;
    --parity-marker)
      PARITY_MARKER="$2"
      shift 2
      ;;
    --source)
      SRC="$2"
      shift 2
      ;;
    --skip-click)
      SKIP_CLICK=1
      shift
      ;;
    --retries)
      RETRIES="$2"
      shift 2
      ;;
    --retry-delay-ms)
      RETRY_DELAY_MS="$2"
      shift 2
      ;;
    --connect-timeout)
      CURL_CONNECT_TIMEOUT="$2"
      shift 2
      ;;
    --max-time)
      CURL_MAX_TIME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        POSITIONAL+=("$1")
        shift
      done
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [[ ${#POSITIONAL[@]} -ge 1 ]]; then
  BASE_URL="${POSITIONAL[0]}"
fi
if [[ ${#POSITIONAL[@]} -ge 2 ]]; then
  EVENT_KEY="${POSITIONAL[1]}"
fi

if [[ -z "$SRC" ]]; then
  SRC="verify_script_$(date +%s)"
fi

if ! [[ "$RETRIES" =~ ^[1-9][0-9]*$ ]]; then
  echo "❌ invalid --retries value: '${RETRIES}' (must be integer >= 1)"
  exit 1
fi
if ! [[ "$RETRY_DELAY_MS" =~ ^[0-9]+$ ]]; then
  echo "❌ invalid --retry-delay-ms value: '${RETRY_DELAY_MS}' (must be integer >= 0)"
  exit 1
fi
if ! [[ "$CURL_CONNECT_TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then
  echo "❌ invalid --connect-timeout value: '${CURL_CONNECT_TIMEOUT}' (must be integer >= 1)"
  exit 1
fi
if ! [[ "$CURL_MAX_TIME" =~ ^[1-9][0-9]*$ ]]; then
  echo "❌ invalid --max-time value: '${CURL_MAX_TIME}' (must be integer >= 1)"
  exit 1
fi

_tmp_dir="$(mktemp -d)"
trap 'rm -rf "${_tmp_dir}"' EXIT

check_contains() {
  local file="$1"
  local needle="$2"
  local label="$3"
  if ! grep -Fq "$needle" "$file"; then
    echo "❌ ${label}: missing '${needle}'"
    echo "---- file (${file}) ----"
    sed -n '1,200p' "$file"
    exit 1
  fi
}

fetch_once() {
  local url="$1"
  local name="$2"
  curl -sS --connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time "$CURL_MAX_TIME" \
    -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
    -D "${_tmp_dir}/${name}.headers" -o "${_tmp_dir}/${name}.body" "$url"
  sed -i 's/\r$//' "${_tmp_dir}/${name}.headers"
}

status_code() {
  local name="$1"
  awk 'NR==1 { print $2 }' "${_tmp_dir}/${name}.headers"
}

check_status_exact() {
  local name="$1"
  local expected="$2"
  local label="$3"
  local actual
  actual="$(status_code "$name")"
  if [[ "$actual" != "$expected" ]]; then
    echo "❌ ${label}: expected status ${expected}, got ${actual:-<none>}"
    sed -n '1,80p' "${_tmp_dir}/${name}.headers"
    exit 1
  fi
}

check_header_contains() {
  local name="$1"
  local header_name="$2"
  local needle="$3"
  local label="$4"

  if ! awk -F': *' -v h="${header_name,,}" -v n="${needle,,}" '
    BEGIN { found=0 }
    {
      key=tolower($1)
      val=tolower(substr($0, index($0, ":")+1))
      gsub(/^ +/, "", val)
      if (key==h && index(val, n)>0) {
        found=1
      }
    }
    END { exit(found ? 0 : 1) }
  ' "${_tmp_dir}/${name}.headers"; then
    echo "❌ ${label}: header '${header_name}' missing value containing '${needle}'"
    sed -n '1,120p' "${_tmp_dir}/${name}.headers"
    exit 1
  fi
}

sleep_ms() {
  local ms="$1"
  python3 - "$ms" <<'PY'
import sys, time
ms = int(sys.argv[1])
time.sleep(ms / 1000.0)
PY
}

fetch_with_retry() {
  local url="$1"
  local name="$2"
  local expected_status="$3"

  local attempt=1
  while (( attempt <= RETRIES )); do
    if fetch_once "$url" "$name"; then
      local code
      code="$(status_code "$name")"
      if [[ "$code" == "$expected_status" ]]; then
        return 0
      fi
    fi

    if (( attempt < RETRIES )); then
      echo "⚠️ ${name}: attempt ${attempt}/${RETRIES} did not return status ${expected_status}; retrying in ${RETRY_DELAY_MS}ms"
      sleep_ms "$RETRY_DELAY_MS"
    fi

    attempt=$((attempt + 1))
  done

  echo "❌ ${name}: exhausted ${RETRIES} attempts waiting for status ${expected_status}"
  sed -n '1,120p' "${_tmp_dir}/${name}.headers" || true
  sed -n '1,200p' "${_tmp_dir}/${name}.body" || true
  exit 1
}

json_string_field() {
  local file="$1"
  local field="$2"
  python3 - "$file" "$field" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
field = sys.argv[2]

try:
    payload = json.loads(path.read_text())
except Exception:
    sys.exit(1)

value = payload.get(field)
if isinstance(value, str):
    print(value)
    sys.exit(0)

sys.exit(1)
PY
}

echo "== Verifying live audit surface on ${BASE_URL} =="
echo "Retries per endpoint: ${RETRIES} (delay ${RETRY_DELAY_MS}ms)"
echo "Curl timeout policy: connect=${CURL_CONNECT_TIMEOUT}s total=${CURL_MAX_TIME}s"
if [[ "$SKIP_CLICK" -eq 1 ]]; then
  echo "Mode: read-only (skipping /api/audit-click probe event insertion)"
else
  echo "Mode: full (includes /api/audit-click probe)"
fi

fetch_with_retry "${BASE_URL}/api/health" "health" "200"
check_status_exact "health" "200" "/api/health status"
check_header_contains "health" "cache-control" "no-store" "/api/health cache-control"
check_contains "${_tmp_dir}/health.body" '"ok":true' "/api/health ok"

HEALTH_PARITY_MARKER="$(json_string_field "${_tmp_dir}/health.body" parityMarker || true)"
HEALTH_EVENT_KEY="$(json_string_field "${_tmp_dir}/health.body" auditEventKey || true)"

if [[ -z "$HEALTH_PARITY_MARKER" ]]; then
  echo "❌ /api/health parity marker: missing or non-string parityMarker field"
  sed -n '1,200p' "${_tmp_dir}/health.body"
  exit 1
fi

if [[ -z "$HEALTH_EVENT_KEY" ]]; then
  echo "❌ /api/health event key: missing or non-string auditEventKey field"
  sed -n '1,200p' "${_tmp_dir}/health.body"
  exit 1
fi

if [[ -z "$PARITY_MARKER" ]]; then
  PARITY_MARKER="$HEALTH_PARITY_MARKER"
fi

if [[ "$HEALTH_EVENT_KEY" != "$EVENT_KEY" ]]; then
  echo "❌ /api/health event key mismatch: health='${HEALTH_EVENT_KEY}' expected='${EVENT_KEY}'"
  exit 1
fi

check_contains "${_tmp_dir}/health.body" "\"parityMarker\":\"${PARITY_MARKER}\"" "/api/health parity marker"
check_contains "${_tmp_dir}/health.body" "\"auditEventKey\":\"${EVENT_KEY}\"" "/api/health event key"
echo "✅ /api/health payload + no-store header verified"

fetch_with_retry "${BASE_URL}/" "root" "200"
check_status_exact "root" "200" "/ status"
check_header_contains "root" "cache-control" "no-store" "/ cache-control"
check_contains "${_tmp_dir}/root.body" "${PARITY_MARKER}" "/ parity marker"
check_contains "${_tmp_dir}/root.body" "Request a paid Node Revenue Audit" "/ audit CTA text"
check_contains "${_tmp_dir}/root.body" "src=hero_primary" "/ audit CTA source"
echo "✅ / parity + CTA markers present"

fetch_with_retry "${BASE_URL}/audit" "audit" "200"
check_status_exact "audit" "200" "/audit status"
check_header_contains "audit" "cache-control" "no-store" "/audit cache-control"
check_contains "${_tmp_dir}/audit.body" "Node Revenue / Automation Audit" "/audit marker"
check_contains "${_tmp_dir}/audit.body" "Start the paid audit" "/audit CTA"
echo "✅ /audit markers + no-store header present"

fetch_with_retry "${BASE_URL}/api/audit-metrics" "metrics" "200"
check_status_exact "metrics" "200" "/api/audit-metrics status"
check_header_contains "metrics" "cache-control" "no-store" "/api/audit-metrics cache-control"
check_contains "${_tmp_dir}/metrics.body" '"ok":true' "/api/audit-metrics ok"
check_contains "${_tmp_dir}/metrics.body" '"hasNonAutomatedExternalIntentLast60m"' "/api/audit-metrics signal field"
echo "✅ /api/audit-metrics payload + no-store header verified"

if [[ "$SKIP_CLICK" -eq 0 ]]; then
  fetch_with_retry "${BASE_URL}/api/audit-click?src=${SRC}&event=${EVENT_KEY}" "audit_click" "302"
  check_status_exact "audit_click" "302" "/api/audit-click status"
  if ! awk -F': *' -v expected="https://t.me/world_fuckery_bot?start=${EVENT_KEY}" '
    BEGIN { found=0 }
    {
      if (tolower($1) == "location") {
        value=$2
        gsub(/\r/, "", value)
        if (value == expected) found=1
      }
    }
    END { exit(found ? 0 : 1) }
  ' "${_tmp_dir}/audit_click.headers"; then
    echo "❌ /api/audit-click destination: unexpected location header"
    sed -n '1,120p' "${_tmp_dir}/audit_click.headers"
    exit 1
  fi
  check_header_contains "audit_click" "cache-control" "no-store" "/api/audit-click cache-control"
  echo "✅ /api/audit-click redirect + no-store header verified"
fi

echo "🎉 Live verification passed for ${BASE_URL}"
if [[ "$SKIP_CLICK" -eq 0 ]]; then
  echo "   Probe source used: ${SRC}"
fi
