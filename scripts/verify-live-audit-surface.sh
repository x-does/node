#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://node.xdoes.space"
EVENT_KEY="node_audit_20260328"
SKIP_CLICK=0
SRC=""

usage() {
  cat <<'EOF'
Usage: verify-live-audit-surface.sh [options] [base_url] [event_key]

Options:
  --base-url <url>     Verification target (default: https://node.xdoes.space)
  --event-key <key>    Audit event key for click redirect check (default: node_audit_20260328)
  --source <src>       Source value for /api/audit-click probe (default: verify_script_<ts>)
  --skip-click         Read-only mode: skip /api/audit-click probe to avoid creating metrics events
  -h, --help           Show this help

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
    --source)
      SRC="$2"
      shift 2
      ;;
    --skip-click)
      SKIP_CLICK=1
      shift
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

_tmp_dir="$(mktemp -d)"
trap 'rm -rf "${_tmp_dir}"' EXIT

check_contains() {
  local file="$1"
  local needle="$2"
  local label="$3"
  if ! grep -Fq "$needle" "$file"; then
    echo "❌ ${label}: missing '${needle}'"
    echo "---- file (${file}) ----"
    sed -n '1,160p' "$file"
    exit 1
  fi
}

fetch() {
  local url="$1"
  local name="$2"
  curl -sS -D "${_tmp_dir}/${name}.headers" -o "${_tmp_dir}/${name}.body" "$url"
  sed -i 's/\r$//' "${_tmp_dir}/${name}.headers"
}

echo "== Verifying live audit surface on ${BASE_URL} =="
if [[ "$SKIP_CLICK" -eq 1 ]]; then
  echo "Mode: read-only (skipping /api/audit-click probe event insertion)"
else
  echo "Mode: full (includes /api/audit-click probe)"
fi

fetch "${BASE_URL}/" "root"
check_contains "${_tmp_dir}/root.headers" "200" "/ status"
check_contains "${_tmp_dir}/root.headers" "no-store" "/ cache-control"
check_contains "${_tmp_dir}/root.body" "Build the money loop." "/ parity marker"
check_contains "${_tmp_dir}/root.body" "Request a paid Node Revenue Audit" "/ audit CTA text"
check_contains "${_tmp_dir}/root.body" "src=hero_primary" "/ audit CTA source"
echo "✅ / parity + CTA markers present"

fetch "${BASE_URL}/audit" "audit"
check_contains "${_tmp_dir}/audit.headers" "200" "/audit status"
check_contains "${_tmp_dir}/audit.body" "Node Revenue / Automation Audit" "/audit marker"
check_contains "${_tmp_dir}/audit.body" "Start the paid audit" "/audit CTA"
echo "✅ /audit markers present"

fetch "${BASE_URL}/api/health" "health"
check_contains "${_tmp_dir}/health.headers" "200" "/api/health status"
check_contains "${_tmp_dir}/health.headers" "no-store" "/api/health cache-control"
check_contains "${_tmp_dir}/health.body" '"ok":true' "/api/health ok"
check_contains "${_tmp_dir}/health.body" '"parityMarker":"Build the money loop."' "/api/health parity marker"
check_contains "${_tmp_dir}/health.body" '"auditEventKey":"node_audit_20260328"' "/api/health event key"
echo "✅ /api/health payload + no-store header verified"

fetch "${BASE_URL}/api/audit-metrics" "metrics"
check_contains "${_tmp_dir}/metrics.headers" "200" "/api/audit-metrics status"
check_contains "${_tmp_dir}/metrics.headers" "no-store" "/api/audit-metrics cache-control"
check_contains "${_tmp_dir}/metrics.body" '"ok":true' "/api/audit-metrics ok"
check_contains "${_tmp_dir}/metrics.body" '"hasNonAutomatedExternalIntentLast60m"' "/api/audit-metrics signal field"
echo "✅ /api/audit-metrics payload + no-store header verified"

if [[ "$SKIP_CLICK" -eq 0 ]]; then
  fetch "${BASE_URL}/api/audit-click?src=${SRC}&event=${EVENT_KEY}" "audit_click"
  check_contains "${_tmp_dir}/audit_click.headers" "302" "/api/audit-click status"
  if ! grep -Eiq "^location:\s*https://t\.me/world_fuckery_bot\?start=${EVENT_KEY}$" "${_tmp_dir}/audit_click.headers"; then
    echo "❌ /api/audit-click destination: unexpected location header"
    sed -n '1,120p' "${_tmp_dir}/audit_click.headers"
    exit 1
  fi
  check_contains "${_tmp_dir}/audit_click.headers" "no-store" "/api/audit-click cache-control"
  echo "✅ /api/audit-click redirect + no-store header verified"
fi

echo "🎉 Live verification passed for ${BASE_URL}"
if [[ "$SKIP_CLICK" -eq 0 ]]; then
  echo "   Probe source used: ${SRC}"
fi
