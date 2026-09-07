#!/usr/bin/env bash
# Idempotent Cloud Agent install: dependencies, local env file, and a cached
# in-memory MongoDB binary. Safe to re-run; nothing here starts a long-lived
# process (those live in environment.json "terminals").
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Installing dependencies (npm ci)"
npm ci

if [[ ! -f .env.local ]]; then
  echo "==> Creating .env.local for local development"
  cat > .env.local <<'EOF'
# Local development environment (in-memory MongoDB)
MONGODB_URI=mongodb://127.0.0.1:27017/eventvault

# Admin gate for /admin
ADMIN_PASSWORD=dev-admin-password-123

# Signed guest/admin sessions (>= 32 chars)
SESSION_SECRET=local-development-session-secret-please-change-000

# Public site URL used in ticket emails
APP_URL=http://localhost:3000

# Cloudflare R2 left blank -> media falls back to local /uploads in dev
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# Gmail left blank -> email sending disabled in dev
GMAIL_USER=
GMAIL_APP_PASSWORD=
EMAIL_FROM_NAME=EventVault Dev
EOF
else
  echo "==> .env.local already exists, leaving it untouched"
fi

echo "==> Pre-downloading in-memory MongoDB binary into cache"
node -e "import('mongodb-memory-server').then(async ({ MongoMemoryServer }) => { const s = await MongoMemoryServer.create(); await s.stop(); console.log('mongodb-memory-server binary cached'); }).catch((e) => { console.error(e); process.exit(1); });"

echo "==> Install complete"
