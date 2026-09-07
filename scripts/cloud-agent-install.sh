#!/usr/bin/env bash
# Idempotent Cloud Agent install.
#
# Credential resolution order:
#   1. Real service env vars already injected into the VM (Cursor Cloud secrets),
#      e.g. MONGODB_URI, R2_*, GMAIL_*. Nothing to do -- the app reads them.
#   2. A VERCEL_TOKEN secret -> pull the project's env vars from Vercel into
#      .env.local (single source of truth stays in Vercel).
#   3. Neither -> generate a local .env.local and use the in-memory MongoDB.
#
# Nothing here starts a long-lived process (those live in environment.json
# "terminals"). Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Installing dependencies (npm ci)"
npm ci

# --- Optional: pull real env from Vercel when a token is provided -------------
# Only a VERCEL_TOKEN is required; the project/team are auto-discovered. You can
# still pin them with VERCEL_PROJECT_ID / VERCEL_ORG_ID if needed.
if [[ -n "${VERCEL_TOKEN:-}" && -z "${MONGODB_URI:-}" ]]; then
  echo "==> VERCEL_TOKEN detected; pulling environment from Vercel"
  if node scripts/vercel-pull-env.mjs; then
    echo "==> Pulled Vercel env into .env.local"
  else
    echo "!! Vercel env pull failed; falling back to the local in-memory setup." >&2
    echo "!! Tip: confirm the token is valid and, if the project is under a team," >&2
    echo "!! set VERCEL_ORG_ID (team_...) and/or VERCEL_PROJECT_ID as secrets." >&2
  fi
fi

MONGO_MODE="$(./scripts/cloud-agent-detect-mongo.sh)"
echo "==> MongoDB mode: $MONGO_MODE"

if [[ "$MONGO_MODE" == "local" ]]; then
  if [[ ! -f .env.local ]]; then
    echo "==> Creating .env.local for local development (in-memory MongoDB)"
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
else
  echo "==> Real MONGODB_URI configured; skipping in-memory MongoDB and local .env.local"
fi

echo "==> Install complete"
