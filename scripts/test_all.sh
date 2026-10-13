#!/usr/bin/env bash
# Runs all smoke-test scripts against a running worker; stops at the first failure.
set -euo pipefail

cd "$(dirname "$0")/.."

export WORKER_URL="${WORKER_URL:-http://localhost:8787/v1}"
export AUTH_TOKEN="${AUTH_TOKEN:-change_this_token}"

echo "Running all tests for $WORKER_URL"

for name in models completions embeddings audio images rag; do
    printf '\n=== Testing %s ===\n' "$name"
    bash "scripts/test_${name}.sh"
done

printf '\nAll tests completed!\n'
