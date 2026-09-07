#!/usr/bin/env bash
# Runs the in-memory MongoDB only when no real MONGODB_URI is configured.
# When real credentials are present, this terminal stays idle (the app talks to
# the real database instead).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MONGO_MODE="$(./scripts/cloud-agent-detect-mongo.sh)"

if [[ "$MONGO_MODE" == "local" ]]; then
  echo "==> Starting in-memory MongoDB (no external MONGODB_URI configured)"
  exec node scripts/start-memory-mongo.mjs
else
  echo "==> External MONGODB_URI configured; in-memory MongoDB not needed."
  echo "==> This terminal is intentionally idle."
  exec sleep infinity
fi
