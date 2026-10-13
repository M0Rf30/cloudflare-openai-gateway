#!/usr/bin/env bash
# OpenAI-compatibility smoke test (requires jq).
set -euo pipefail

API_URL="${API_URL:-http://localhost:8787}"
AUTH_TOKEN="${AUTH_TOKEN:-your_token_here}"

echo "OpenAI Compatibility Test"
echo "=========================="

printf '\ngpt-3.5-turbo:\n'
curl -fsS -X POST "$API_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Hi"}]}' \
  | jq -er '.choices[0].message.content' | cut -c1-40

printf '\ntext-embedding-ada-002:\n'
curl -fsS -X POST "$API_URL/v1/embeddings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"model": "text-embedding-ada-002", "input": "test"}' \
  | jq -e '{model: .model, dims: (.data[0].embedding | length)}'

printf '\nAll tests passed!\n'
