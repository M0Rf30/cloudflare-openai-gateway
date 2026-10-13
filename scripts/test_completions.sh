#!/usr/bin/env bash
# Smoke test for /v1/chat/completions (plain and streaming).
set -euo pipefail

WORKER_URL="${WORKER_URL:-http://localhost:8787/v1}"
AUTH_TOKEN="${AUTH_TOKEN:-change_this_token}"

echo "Testing completions endpoint at $WORKER_URL"

echo "Testing chat completion..."
curl -fsS -X POST "$WORKER_URL/chat/completions" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'

printf '\nTesting chat completion with streaming...\n'
curl -fsSN -X POST "$WORKER_URL/chat/completions" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Count to 5."}
    ],
    "stream": true
  }'

printf '\nAll completions tests completed!\n'
