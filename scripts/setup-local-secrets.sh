#!/usr/bin/env bash
# One-time local setup for the n8n side. Run it yourself (it writes secrets; nothing is printed).
#   1. generates LENDLOOP_TO_N8N_SECRET, N8N_TO_LENDLOOP_SECRET (and N8N_ENCRYPTION_KEY if new)
#   2. writes n8n/.env (gitignored) for docker compose
#   3. sets the two shared secrets in the Convex dev deployment via stdin (not shell history)
# Re-run with --force to rotate the two shared secrets (keeps the n8n encryption key).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ENV_FILE="n8n/.env"
if [ -f "$ENV_FILE" ] && [ "${1:-}" != "--force" ]; then
  echo "$ENV_FILE already exists. Use --force to rotate the shared secrets." >&2
  exit 1
fi

gen() { node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"; }

# Convex site URL = cloud URL with .convex.site (HTTP actions live there).
cloud_url=$(grep -E '^NEXT_PUBLIC_CONVEX_URL=' .env.local | head -1 | cut -d= -f2- | tr -d "\"' \r")
if [ -z "$cloud_url" ]; then
  echo "NEXT_PUBLIC_CONVEX_URL not found in .env.local (run npx convex dev first)." >&2
  exit 1
fi
site_url="${cloud_url%.convex.cloud}.convex.site"

enc_key=""
if [ -f "$ENV_FILE" ]; then
  enc_key=$(grep -E '^N8N_ENCRYPTION_KEY=' "$ENV_FILE" | cut -d= -f2- || true)
fi
[ -n "$enc_key" ] || enc_key=$(gen)

to_n8n=$(gen)
to_lendloop=$(gen)

umask 077
cat > "$ENV_FILE" <<EOF
LENDLOOP_TO_N8N_SECRET=$to_n8n
N8N_TO_LENDLOOP_SECRET=$to_lendloop
CONVEX_SITE_URL=$site_url
OPS_EMAIL=ops@lendloop.local
N8N_ENCRYPTION_KEY=$enc_key
EOF

printf '%s' "$to_n8n" | npx convex env set LENDLOOP_TO_N8N_SECRET > /dev/null
printf '%s' "$to_lendloop" | npx convex env set N8N_TO_LENDLOOP_SECRET > /dev/null

echo "OK: wrote $ENV_FILE and set LENDLOOP_TO_N8N_SECRET + N8N_TO_LENDLOOP_SECRET in Convex."
echo "CONVEX_SITE_URL=$site_url"
echo "If n8n is running, apply the new values with: docker compose up -d --force-recreate n8n"
