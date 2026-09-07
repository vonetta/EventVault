#!/usr/bin/env bash
# Cloud Agent dev server: wait for the in-memory MongoDB, seed demo data once,
# then run Next.js dev bound to all interfaces. Runs as a long-lived terminal.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Waiting for MongoDB on 127.0.0.1:27017"
for _ in $(seq 1 60); do
  if (echo >/dev/tcp/127.0.0.1/27017) >/dev/null 2>&1; then
    echo "==> MongoDB is up"
    break
  fi
  sleep 0.5
done

if ! (echo >/dev/tcp/127.0.0.1/27017) >/dev/null 2>&1; then
  echo "!! MongoDB did not become available on port 27017" >&2
  exit 1
fi

echo "==> Seeding demo data (idempotent)"
node scripts/seed-demo.mjs || true

echo "==> Starting Next.js dev server on http://0.0.0.0:3000"
exec npm run dev -- --hostname 0.0.0.0 --port 3000
