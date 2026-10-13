#!/usr/bin/env bash
# Smoke test for /v1/models.
set -euo pipefail

WORKER_URL="${WORKER_URL:-http://localhost:8787/v1}"
AUTH_TOKEN="${AUTH_TOKEN:-change_this_token}"

echo "Testing models endpoint at $WORKER_URL"

curl -fsS "$WORKER_URL/models" \
  -H "Authorization: Bearer $AUTH_TOKEN"

printf '\nAll models tests completed!\n'
