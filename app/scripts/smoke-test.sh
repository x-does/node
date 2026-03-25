#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"

echo "[1/4] health"
curl -fsS "$BASE_URL/health" | tee /tmp/node-health.json >/dev/null

echo "[2/4] status"
curl -fsS "$BASE_URL/api/status" | tee /tmp/node-status.json >/dev/null

echo "[3/4] create lead"
curl -fsS -X POST "$BASE_URL/api/leads" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Test","email":"savusavuuu@gmail.com","idea":"Hostinger smoke test"}' \
  | tee /tmp/node-lead-create.json >/dev/null

echo "[4/4] list leads"
curl -fsS "$BASE_URL/api/leads/list" | tee /tmp/node-leads.json >/dev/null

echo "Smoke test OK"
