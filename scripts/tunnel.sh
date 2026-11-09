#!/usr/bin/env bash
# Starts a Cloudflare Quick Tunnel (no account) to the webhook-only proxy and points Convex at it.
# The URL changes every time the tunnel starts, so Convex's N8N_WEBHOOK_URL is updated each run.
# Use --print to only print the command instead of running it.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

docker compose --profile tunnel up -d --force-recreate tunnel > /dev/null

url=""
for _ in $(seq 1 45); do
  url=$(docker compose --profile tunnel logs tunnel 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  [ -n "$url" ] && break
  sleep 1
done
if [ -z "$url" ]; then
  echo "Tunnel URL not found. Check: docker compose --profile tunnel logs tunnel" >&2
  exit 1
fi

webhook="$url/webhook/lendloop-loan-events"
echo "Tunnel: $url (forwards only POST /webhook/lendloop-loan-events)"
if [ "${1:-}" = "--print" ]; then
  echo "Run: npx convex env set N8N_WEBHOOK_URL $webhook"
else
  npx convex env set N8N_WEBHOOK_URL "$webhook"
fi
