#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://node.xdoes.space}"
EVENT_KEY="${2:-node_audit_20260328}"
TS="$(date +%s)"
SRC="verify_script_${TS}"

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

fetch "${BASE_URL}/api/audit-click?src=${SRC}&event=${EVENT_KEY}" "audit_click"
check_contains "${_tmp_dir}/audit_click.headers" "302" "/api/audit-click status"
if ! grep -Eiq "^location:\s*https://t\.me/world_fuckery_bot\?start=${EVENT_KEY}$" "${_tmp_dir}/audit_click.headers"; then
  echo "❌ /api/audit-click destination: unexpected location header"
  sed -n '1,120p' "${_tmp_dir}/audit_click.headers"
  exit 1
fi
check_contains "${_tmp_dir}/audit_click.headers" "no-store" "/api/audit-click cache-control"
echo "✅ /api/audit-click redirect + no-store header verified"

echo "🎉 Live verification passed for ${BASE_URL}"
echo "   Probe source used: ${SRC}"
