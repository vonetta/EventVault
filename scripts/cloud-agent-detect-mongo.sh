#!/usr/bin/env bash
# Prints "external" when a real (non-local) MONGODB_URI is configured, else
# "local". Checks the process environment first (Cursor Cloud secrets / Vercel
# pull), then falls back to .env.local. Used by install/mongo/dev scripts to
# decide whether to run the in-memory MongoDB + demo seed, or use real keys.
#
# If VERCEL_TOKEN is set, never report "local": the intent is Atlas via Vercel
# (or a Cursor secret), and we must not start in-memory MongoDB or seed data.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

uri="${MONGODB_URI:-}"

if [[ -z "$uri" && -f "$ROOT/.env.local" ]]; then
  uri="$(grep -E '^MONGODB_URI=' "$ROOT/.env.local" | head -n1 | cut -d= -f2- || true)"
  uri="${uri%\"}"
  uri="${uri#\"}"
fi

is_usable_remote=1
if [[ -z "$uri" || "$uri" == *"127.0.0.1"* || "$uri" == *"localhost"* || "$uri" == "[SENSITIVE]" ]]; then
  is_usable_remote=0
fi

if [[ "$is_usable_remote" -eq 1 ]]; then
  echo "external"
elif [[ -n "${VERCEL_TOKEN:-}" ]]; then
  # Token present but URI unreadable (Sensitive Vercel vars, failed pull, etc.).
  echo "external"
else
  echo "local"
fi
