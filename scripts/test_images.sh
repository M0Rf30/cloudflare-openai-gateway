#!/usr/bin/env bash
# Smoke test for /v1/images/generations.
set -euo pipefail

WORKER_URL="${WORKER_URL:-http://localhost:8787/v1}"
AUTH_TOKEN="${AUTH_TOKEN:-change_this_token}"

echo "Testing image generation endpoint at $WORKER_URL"

curl -fsS -X POST "$WORKER_URL/images/generations" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "A cute baby sea otter",
    "n": 1,
    "size": "1024x1024"
  }'

printf '\nAll image generation tests completed!\n'
