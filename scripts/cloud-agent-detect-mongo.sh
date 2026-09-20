#!/usr/bin/env bash
# Prints "external" when a real (non-local) MONGODB_URI is configured, else
# "local". Checks the process environment first (Cursor Cloud secrets / Vercel
# pull), then falls back to .env.local. Used by install/mongo/dev scripts to
# decide whether to run the in-memory MongoDB + demo seed, or use real keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

uri="${MONGODB_URI:-}"

if [[ -z "$uri" && -f "$ROOT/.env.local" ]]; then
  uri="$(grep -E '^MONGODB_URI=' "$ROOT/.env.local" | head -n1 | cut -d= -f2- || true)"
  uri="${uri%\"}"
  uri="${uri#\"}"
fi

if [[ -z "$uri" || "$uri" == *"127.0.0.1"* || "$uri" == *"localhost"* ]]; then
  echo "local"
else
  echo "external"
fi
