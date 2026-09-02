#!/usr/bin/env bash
# Local preview for the tokenized-stocks page: B20 quote shim + Vite.
set -euo pipefail
cd "$(dirname "$0")/../.."
npx tsx scripts/b20/dev-api.mts &
SHIM=$!
trap 'kill $SHIM 2>/dev/null || true' EXIT
PORT="${PORT:-8080}" npx vite --port "${PORT:-8080}"
