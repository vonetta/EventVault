#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example"
fi

wait_for_mongo() {
  for _ in $(seq 1 30); do
    if (echo >/dev/tcp/127.0.0.1/27017) >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

if ! (echo >/dev/tcp/127.0.0.1/27017) >/dev/null 2>&1; then
  if ! pgrep -f "start-memory-mongo.mjs" >/dev/null 2>&1; then
    echo "Starting memory MongoDB on port 27017..."
    node scripts/start-memory-mongo.mjs &
    MONGO_PID=$!
    if ! wait_for_mongo; then
      echo "MongoDB did not start. Check that port 27017 is free."
      kill "$MONGO_PID" 2>/dev/null || true
      exit 1
    fi
    echo "MongoDB ready."
  else
    wait_for_mongo || { echo "MongoDB process exists but port 27017 is not open."; exit 1; }
  fi
else
  echo "MongoDB already running on port 27017."
fi

echo "Seeding demo event (skipped if already exists)..."
node scripts/seed-demo.mjs || true

echo ""
echo "Starting EventVault at http://localhost:3000"
echo "Admin: http://localhost:3000/admin/login  (password in .env.local)"
echo "Demo tickets: EV-DEMO-VIP (VIP)  EV-DEMO-STD (Standard)"
echo ""
npm run dev
