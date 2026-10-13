#!/usr/bin/env bash
# Smoke test for /v1/embeddings.
set -euo pipefail

WORKER_URL="${WORKER_URL:-http://localhost:8787/v1}"
AUTH_TOKEN="${AUTH_TOKEN:-change_this_token}"

echo "Testing embeddings endpoint at $WORKER_URL"

curl -fsS -X POST "$WORKER_URL/embeddings" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Hello, world!"
  }'

printf '\nAll embeddings tests completed!\n'
