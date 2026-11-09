#!/usr/bin/env bash
# Imports the LendLoop SMTP credential (Mailpit, no secret) and the 3 workflows into the running
# n8n container, publishes them and restarts n8n so the webhook and schedule go live.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export MSYS_NO_PATHCONV=1 # Git Bash on Windows: keep container paths as-is

docker compose exec -T n8n sh -c 'rm -rf /tmp/ll && mkdir -p /tmp/ll/wf'
docker compose cp n8n/mailpit-credential.json n8n:/tmp/ll/cred.json > /dev/null
for f in n8n/workflows/*.json; do docker compose cp "$f" n8n:/tmp/ll/wf/ > /dev/null; done

docker compose exec -T n8n n8n import:credentials --input=/tmp/ll/cred.json
docker compose exec -T n8n n8n import:workflow --separate --input=/tmp/ll/wf
for id in llErrorHandler01 llRequestNotif01 llOverdueRemind1; do
  docker compose exec -T n8n n8n publish:workflow --id="$id" > /dev/null
done
docker compose restart n8n > /dev/null
echo "OK: imported and published 3 workflows. n8n restarting at http://localhost:5678"
