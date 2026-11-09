#!/usr/bin/env bash
# Runs the overdue-reminders workflow once now (same as its daily 09:00 UTC schedule).
# Uses another task-broker port because the main n8n process already uses 5679.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=llOverdueRemind1 \
  | grep -E '"status"' | tail -1
