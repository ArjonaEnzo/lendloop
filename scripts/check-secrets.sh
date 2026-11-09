#!/usr/bin/env bash
# Fails (exit 1) if anything that looks like a secret is in files git would commit.
# Scans tracked + untracked-but-not-ignored files. Prints file:line only, never the value.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2

found=0

# $1 = label, $2 = `git grep -n` output. Called in the main shell so found=1 sticks.
report() {
  local hits
  hits=$(printf '%s\n' "$2" | grep -v '^$' | cut -d: -f1,2 | grep -v '^scripts/check-secrets.sh:' || true)
  if [ -n "$hits" ]; then
    echo "SECRET CHECK FAILED ($1):" >&2
    echo "$hits" >&2
    found=1
  fi
}

# 1) Known key shapes
out=$(git grep -nIE --untracked \
  -e 'sk_(live|test)_[A-Za-z0-9]{10,}' \
  -e 'pk_(live|test)_[A-Za-z0-9]{20,}' \
  -e 'whsec_[A-Za-z0-9]{10,}' \
  -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  -e '"password"[[:space:]]*:[[:space:]]*"[^"]+"' \
  -- . ':!pnpm-lock.yaml')
report "key pattern" "$out"

# 2) Literal values from local env files (values >= 8 chars)
for envfile in ${CHECK_SECRETS_ENV_FILES:-.env.local .env}; do
  [ -f "$envfile" ] || continue
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    value="${line#*=}"
    value="${value%%#*}" # strip trailing comment
    value="$(printf '%s' "$value" | sed -e "s/^[[:space:]\"']*//" -e "s/[[:space:]\"']*\$//")"
    [ ${#value} -ge 8 ] || continue
    out=$(git grep -nIF --untracked -e "$value" -- .)
    report "value from $envfile (${line%%=*})" "$out"
  done < "$envfile"
done

# 3) Exported n8n workflows: no tunnel URLs, no inline secrets, no long hex keys
if ls n8n/workflows/*.json >/dev/null 2>&1; then
  out=$(git grep -nIE --untracked \
    -e 'trycloudflare\.com' \
    -e '"(password|secret|apiKey|token)"[[:space:]]*:[[:space:]]*"[^"]+"' \
    -e '[0-9a-fA-F]{64}' \
    -- 'n8n/workflows/*.json')
  report "n8n workflow JSON" "$out"
fi

if [ "$found" -ne 0 ]; then
  exit 1
fi
echo "check-secrets: OK"
