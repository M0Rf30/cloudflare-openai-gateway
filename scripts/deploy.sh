#!/usr/bin/env bash
# Deploy to Cloudflare Workers
# Usage: ./scripts/deploy.sh
set -euo pipefail

# Load .dev.vars (KEY=VALUE lines) without word-splitting or eval of values
if [ -f .dev.vars ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.dev.vars
    set +a
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo "Error: CLOUDFLARE_ACCOUNT_ID not set"
    echo "Either:"
    echo "  1. Add CLOUDFLARE_ACCOUNT_ID to .dev.vars"
    echo "  2. Export it: export CLOUDFLARE_ACCOUNT_ID=your-account-id"
    exit 1
fi

echo "Deploying to Cloudflare Workers..."
echo "Account ID: $CLOUDFLARE_ACCOUNT_ID"
npx wrangler deploy
