# Security self-review — LendLoop

Date: 2026-11-09. Reviewer: the author (Enzo Arjona), with AI-assisted review tools.

> **This is a self-review of a take-home project, not a professional security audit or a penetration
> test.** It checks the code against a known checklist and fixes what it finds. A production version
> would add an independent review and an external pentest (see "Not covered" at the end).

## How the review was done

1. **Automated review** with the `sentry-security-review` skill (OWASP-based checklist that only reports
   findings with a traced, attacker-controlled input) over `convex/`, `app/`, `components/`, `lib/`,
   `n8n/workflows/*.json`, `docker-compose.yml`, `n8n/Caddyfile` and `scripts/`.
2. **Manual OWASP Top 10 (2021) pass**, below.
3. **Access-control inventory**: every exported Convex function and HTTP route with its guard.
4. Each confirmed finding was fixed **test-first**: a test that reproduces it, seen failing, then passing.

Earlier automated reviews during the build (days 1–2) are also recorded here, because their fixes are part
of the current code.

## Access-control inventory

The browser can call only `query` / `mutation` functions. `internal*` functions can be called only by
other Convex functions (scheduler, HTTP actions) or by the deployment owner with the Convex CLI.
The user is always derived from the verified Clerk JWT (`ctx.auth.getUserIdentity()`), never from an
argument. The admin role is recomputed on every request (verified email + `ADMIN_EMAILS` env var).

| Function | Kind | Guard | Ownership / extra checks |
|---|---|---|---|
| `users.store` | mutation | signed in (identity) | writes only the caller's row; role is a display cache |
| `users.me` | query | signed in, else `null` | returns name, live role, trusted flag. No email |
| `tools.listPublic` | query | **public by design** | returns only `{ name, category }` of available tools |
| `tools.listCatalog` | query | `requireUser` | owner shown by name only, no email |
| `tools.myListings` | query | `requireUser` | only the caller's tools |
| `tools.create` | mutation | `requireUser` | length limits, enum validators, ≤ 50 live tools per user |
| `tools.update` | mutation | `requireUser` | owner only (admins moderate by removing, not editing) |
| `tools.remove` | mutation | `requireUser` | owner or admin; owner blocked while lent out |
| `loans.request` | mutation | `requireUser` | not own tool; valid dates; ≤ 10 pending; ≤ 20 new per 24 h; no duplicate overlap |
| `loans.cancel` | mutation | `requireUser` | borrower only; state machine |
| `loans.approve` | mutation | `requireUser` | tool owner only; no overlap with an approved loan |
| `loans.decline` | mutation | `requireUser` | tool owner only; state machine |
| `loans.markReturned` | mutation | `requireUser` | tool owner only; state machine |
| `loans.myRequests` | query | `requireUser` | only loans where caller is borrower |
| `loans.incoming` | query | `requireUser` | only loans where caller is owner |
| `admin.allLoans` | query | `requireAdmin` | names only, no emails |
| `admin.users` | query | `requireAdmin` | no emails |
| `admin.setTrustedLender` | mutation | `requireAdmin` | |
| `admin.failedDeliveries` | query | `requireAdmin` | payload (with emails) not returned |
| `admin.workflowErrors` | query | `requireAdmin` | |
| `automation.overdue` | internalQuery | not callable from browser | used by `GET /api/overdue-loans` |
| `automation.record` | internalMutation | not callable from browser | key must belong to the loan and kind |
| `automation.recordError` | internalMutation | not callable from browser | |
| `outbox.get` / `outbox.deliver` / `outbox.markResult` | internal | not callable from browser | |
| `dev.seedOverdueLoan` | internalMutation | not callable from browser | also refuses unless `ALLOW_DEV_TOOLS=true` |
| `GET /api/overdue-loans` | HTTP action | HMAC (`N8N_TO_LENDLOOP_SECRET`) | 16 KB limit before HMAC; 401 without detail |
| `POST /api/automation-events` | HTTP action | HMAC | JSON parsed as `unknown`, field-by-field checks; idempotency key |
| `POST /api/workflow-errors` | HTTP action | HMAC | same; idempotency key `error:{executionId}` |
| n8n `POST /webhook/lendloop-loan-events` | n8n webhook | HMAC (`LENDLOOP_TO_N8N_SECRET`) over the raw body | Caddy forwards only this path; everything else 404 |

## OWASP Top 10 (2021) checklist

| Area | Status | Notes |
|---|---|---|
| A01 Broken access control | Checked | Table above. Tests cover owner-only, borrower-only and admin-only paths, and "user not registered". UI hiding is cosmetic only. |
| A02 Cryptographic failures | Checked | HMAC-SHA256 with Web Crypto / Node `crypto`; constant-time compare; two secrets (one per direction); secrets only in env (Convex env, gitignored `n8n/.env`). HTTPS via Convex and the Cloudflare tunnel. |
| A03 Injection | Checked | No SQL; Convex queries use typed indexes. React escapes output; no `dangerouslySetInnerHTML`. Emails are plain text and the n8n Code nodes strip CR/LF and cap length, so names cannot inject headers or HTML. |
| A04 Insecure design | Checked | Outbox in the same transaction as the change; state machine with explicit allowed moves; limits per user. Found the request/cancel email flood (F-1). |
| A05 Security misconfiguration | Checked | CSP and headers (`next.config.ts`); compose ports bound to 127.0.0.1; n8n editor not exposed through the tunnel; Convex functions validate every argument. |
| A06 Vulnerable components | Checked | Exact versions, lockfile, `pnpm audit --audit-level=high` in CI, Dependabot. Current state: 0 high, 1 moderate (dev-only `minimatch` under `eslint-config-next`). Docker images pinned by tag. |
| A07 Identification & authentication | Checked | Clerk handles sign-in. Convex checks the JWT issuer and `aud: "convex"`. Admin needs a **verified** email. |
| A08 Software & data integrity | Checked | Signed payloads both ways; idempotency keys on write-backs; CI actions pinned to commit SHAs; workflow JSON exported without credentials and scanned. |
| A09 Logging & monitoring | Partial | Failed deliveries and failed n8n runs are stored and shown in `/admin`; rejected HMAC calls are logged (reason only). No central log/alerting: production plan. |
| A10 SSRF | Checked | The only server-side `fetch` uses `N8N_WEBHOOK_URL` from the Convex env (operator-controlled), not user input. |

## Findings and fixes

| ID | Severity | Finding | Fix | Test | Commit |
|---|---|---|---|---|---|
| F-1 | Medium | A borrower could loop *request → cancel*. Each cancel freed a slot under the 10-pending cap, and each step emailed the tool owner, so one account could flood an owner's inbox. | New requests capped at 20 per borrower per rolling 24 h. | `loans.test.ts` › "caps new requests at 20 per borrower per 24 hours…" (RED → GREEN) | `b41c499` |
| F-2 | Low | The display name comes from the Clerk token (user-editable) and is shown to other users and put in emails, with no length limit. | Trimmed and capped at 80 characters in `users.store`. | `users.test.ts` › "caps a very long display name at 80 characters" (RED → GREEN) | `b41c499` |
| F-3 (day 1) | High | The admin role was read from the stored user row, so removing an email from `ADMIN_EMAILS` did not take effect until the next sign-in. | Role recomputed on every request from the live token. | `users.test.ts` › "revoking ADMIN_EMAILS removes admin immediately…" | `64d2c8a` |
| F-4 (day 2) | Medium (accepted) | Canonical string `timestamp.METHOD.path.body` could be ambiguous if fields were free-form. | Kept: verifiers fix METHOD and path themselves, timestamp must be digits, body is last, so field borders cannot move. | `hmac.test.ts` | — |
| F-5 (day 2) | Medium | A signed caller could write an idempotency key for a different loan. | Key must start with the loan's own id and match the kind. | `http.test.ts` | `48d1bfc` |

## Accepted risks (known, documented, not fixed)

- **Replay inside the 5-minute window.** A captured, valid request could be replayed within 300 s.
  Write-backs are protected by idempotency keys (no new row). A replayed Convex → n8n notification could
  send the same email twice. Production plan: a nonce store (remember signature or eventId for 5 min).
- **At-least-once email.** If n8n sends the email but the response to Convex is lost, Convex retries and the
  email can be sent again. Exactly-once would need n8n to check the `notify:{eventId}` key before sending.
- **CSP keeps `'unsafe-inline'` for scripts.** Next.js App Router adds inline scripts. A nonce-based CSP
  removes this but forces dynamic rendering. Production plan.
- **No global rate limiting.** Limits are per user and per action (tools, pending, daily requests). An
  unauthenticated visitor can call `tools.listPublic` often (it is bounded to 200 tools). Production plan:
  `@convex-dev/rate-limiter` and an edge rate limit.
- **Quick tunnel.** The Cloudflare quick tunnel URL is random and public. Only the signed webhook path is
  reachable through it. Production: a fixed domain and a managed host.

## Not covered

- No professional audit and no penetration test.
- No threat model workshop, no fuzzing, no load or DoS testing.
- Clerk, Convex, n8n and Cloudflare are trusted as platforms; their own security was not reviewed.
- No formal compliance mapping. The README maps decisions to control areas using "aligned with"
  language only; this project is **not** certified or compliant with any standard.
