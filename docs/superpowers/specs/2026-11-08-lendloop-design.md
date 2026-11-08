# LendLoop — Design (2026-11-08)

Take-home for Fluence International (Full-Stack Developer). Source of truth for requirements:
the original job post (archived outside this repo). This doc records how we build it.

## 1. Intent

A neighborhood tool-lending board: neighbors list tools, request to borrow them for a date
range, owners approve/decline, loans get marked returned. n8n sends notifications and daily
overdue reminders.

What the reviewers grade: code clarity, security thinking, UX, n8n integration reliability,
documentation. The code must be easy to read and to explain decision by decision
→ **prefer simple, readable code over clever code.** Few
abstractions, obvious names, comments only where the *why* is non-obvious.

### Goals
- Every requirement of the brief met, verifiably (tests + manual E2E run).
- Authorization enforced in Convex functions; UI checks are cosmetic only.
- n8n integration signed (HMAC) in both directions, replay-protected, idempotent, no silent failures.
- Reviewer can run everything locally with free accounts + `docker compose up`.

### Non-goals
Payments, chat, tool photos, native mobile, i18n, a hosted public demo.

### Anti-goals (failure even if it works)
- Any secret in git history or exported n8n JSON.
- Public page or n8n payloads leaking more owner/borrower data than needed.
- Code the author cannot explain.
- Claiming experience not had (AWS appears only as a production plan).

## 2. Constraints
- Stack (mandatory): Next.js App Router, TypeScript, Clerk, Convex, n8n self-hosted (Docker), Tailwind.
- Free tiers only. Accounts (Clerk, Convex, GitHub) created by Enzo; keys go in `.env.local` (gitignored).
- Package manager: pnpm. Node 24. Windows dev machine (scripts must work in Git Bash / PowerShell).
- Delivery: public GitHub repo, local run + screenshots/GIF in README (decided with Enzo).
- Code, commits, README in English.

## 3. Architecture

```
Browser (Next.js + Clerk)
   │  Convex React client, Clerk JWT
   ▼
Convex cloud (dev deployment)
   ├─ queries/mutations  ← auth + role + ownership checks here
   ├─ scheduler → action "deliverOutbox"  ──HMAC POST──►  Cloudflare Quick Tunnel ─► n8n (Docker)
   └─ HTTP actions (convex/http.ts)       ◄──HMAC GET/POST── n8n (daily cron, write-backs)
                                                          n8n ─SMTP─► Mailpit (Docker, :8025 UI)
```

- Convex runs in the cloud (free dev deployment). It cannot reach `localhost`, so the n8n webhook
  is exposed with `cloudflared tunnel --url http://localhost:5678` (free, no account). The tunnel
  URL goes into the Convex env var `N8N_WEBHOOK_URL`. n8n → Convex goes straight to the public
  `*.convex.site` URL.
- Email: **Mailpit** in the same docker-compose. n8n uses its Send Email (SMTP) node with an SMTP
  credential stored in n8n. Real emails, visible at `http://localhost:8025`, zero real credentials.
  Production swap = change the SMTP credential (SES/Resend).

## 4. Data model (Convex)

Dates for loans are `"YYYY-MM-DD"` strings, interpreted in UTC. Timestamps are ms numbers.

**users**
- `clerkId` (string, from `identity.subject`; index `by_clerkId`)
- `email` (string) — only used server-side for notifications
- `name` (string) — display name (first name or Clerk name)
- `role`: `"admin" | "user"`
- `trustedLender`: boolean — per the brief, a badge the admin toggles; it unlocks no behavior.
  Shown next to the owner's name in the signed-in catalog.

Users are created/updated by a `users.store` mutation the client calls after sign-in (Convex's
documented Clerk pattern). The Clerk token must carry `email` and `email_verified` claims
(builder: verify the Clerk↔Convex integration includes them; add a JWT template claim if not).
Role: `admin` only if the email is **verified** and in the Convex env var `ADMIN_EMAILS`
(comma-separated), else `user`. **Role is never settable from the client.** The source of truth
for the role is this table, not Clerk metadata.

**tools**
- `ownerId` (Id<users>; index `by_owner`)
- `name`, `description` (strings; length-limited server-side: name ≤ 80, description ≤ 500)
- `category`: `"power_tools" | "hand_tools" | "garden" | "kitchen" | "camping" | "cleaning" | "other"`
- `condition`: `"new" | "good" | "fair" | "worn"`
- `deletedAt?` (number) — soft delete so loan history keeps a valid reference
- index `by_category`

**loans**
- `toolId`, `borrowerId`, `ownerId` (denormalized owner for fast "incoming" queries)
- `startDate`, `endDate` ("YYYY-MM-DD", start ≤ end, start ≥ today at request time)
- `status`: `"requested" | "approved" | "declined" | "cancelled" | "returned"`
- `returnedAt?`, `updatedAt`
- indexes `by_borrower`, `by_owner`, `by_tool`, `by_status_endDate`

State machine (enforced in mutations):
- requested → approved | declined (owner only); requested → cancelled (borrower only)
- approved → returned (owner only; borrower cannot self-confirm return)
- System transitions (no human actor, still notify): when a request is approved, other *requested*
  loans of the same tool whose dates overlap are auto-**declined**; when a tool is deleted, its
  *requested* loans are auto-**cancelled**.
- Deleting a tool that has an *approved, not returned* loan: blocked for the owner (clear error);
  allowed for admin (moderation) — the approved loan stays so it can still be marked returned.
- No other transitions. Approving checks no other *approved* loan of the same tool overlaps the dates.
- Cannot request own tool, a deleted tool, or overlap own pending request on the same tool.

"Overdue" = `status == "approved"` and `endDate < today (UTC)`.
"Available" (tool) = not deleted and no approved loan covering today.

Note: Convex has no unique constraints. "Unique" below means: index + lookup-then-insert inside
one mutation (mutations are serializable transactions, so this is race-safe).

**outbox** (Convex → n8n deliveries)
- `eventId` (string, unique; index) = `"loan:{loanId}:{status}:{updatedAt}"`
- `payload` (the minimal JSON sent)
- `status`: `"pending" | "sent" | "failed"`, `attempts`, `lastError?`, `nextAttemptAt?`

**automationEvents** (activity log written by n8n, shown on each loan — bonus)
- `idempotencyKey` (string, unique; index)
- `loanId`, `kind`: `"request_notification_sent" | "overdue_reminder_sent"`
- `detail?` (short string), `createdAt`

**workflowErrors** (written by the n8n error workflow; shown in admin view)
- `idempotencyKey` (`"error:{executionId}"`), `workflowName`, `executionId`, `nodeName?`, `message`, `createdAt`
  (The n8n Error Trigger exposes execution/error metadata, not the failed items, so no loanId.)

## 5. Authorization (Convex functions)

Helpers in `convex/lib/auth.ts`:
- `requireUser(ctx)` → loads user by `identity.subject`, throws if not signed in / not stored.
- `requireAdmin(ctx)` → `requireUser` + `role === "admin"`.
- Ownership checks inline in each mutation (`tool.ownerId === user._id`), with clear error messages.

| Action | Who |
|---|---|
| List public tools (name + category only) | anyone (no auth) |
| Catalog with availability + owner display name + Trusted badge | signed in |
| Create tool | signed in |
| Edit / delete tool | owner; admin may delete any |
| Request loan / cancel own request | signed in borrower |
| Approve / decline / mark returned | tool owner |
| View all loans, mark Trusted Lender | admin |

Public query returns a projection `{ name, category }` only — no ids of owners, no descriptions
needed beyond that. Emails are never returned to the browser.

## 6. n8n integration

### 6.1 Signing scheme (both directions)
- Headers: `X-LendLoop-Timestamp` (unix seconds), `X-LendLoop-Signature` = `hex(HMAC-SHA256(secret, canonical))`.
- Canonical string, one format for every request: `` `${timestamp}.${METHOD}.${path}.${rawBody}` ``
  - `METHOD` uppercase; `path` = URL pathname only, **no query string, no host** (requests use no query params);
    `rawBody` = exact bytes sent (empty string for GET).
  - Convex verifier uses `new URL(request.url).pathname`. n8n verifier uses the constant webhook path
    (`/webhook/lendloop-loan-events`) because the tunnel host differs from what n8n sees.
  - One `canonicalString()` function per side; the Convex one is unit-tested with fixed vectors that the
    n8n Code node must also reproduce (documented in README).
- Receiver rejects if `|now - timestamp| > 300s` (replay window) or signature mismatch
  (constant-time compare). Rejections return 401 with no detail and are logged.
- One shared secret per direction: `LENDLOOP_TO_N8N_SECRET` (Convex signs, n8n verifies) and
  `N8N_TO_LENDLOOP_SECRET` (n8n signs, Convex verifies). Compromise of one direction does not grant the other.
- Convex side: Web Crypto (`crypto.subtle`) in `convex/lib/hmac.ts`, pure and unit-tested.
- n8n side: Code node with `require('crypto')`; secret read from `$env` (n8n container env from a
  gitignored `.env`). Current n8n blocks env access and builtins by default and runs Code in task
  runners → compose must set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` and `NODE_FUNCTION_ALLOW_BUILTIN=crypto`
  for the runner (builder: verify against the pinned n8n version; fallback = n8n's built-in Crypto node
  for HMAC). SMTP lives in an n8n credential. Exported JSON contains neither.

### 6.2 Workflow 1 — Request notification
1. Loan mutation (create / status change) inserts an `outbox` row and schedules `internal.outbox.deliver` (runAfter 0).
2. Action POSTs the signed payload to `N8N_WEBHOOK_URL`. On non-2xx/timeout: `attempts++`, reschedule with
   backoff (1 min, 5 min, 30 min); after 4 attempts → `failed` (visible in admin view).
3. n8n: Webhook (raw body, "Respond: using Respond to Webhook node") → Verify HMAC (Code) → IF valid
   (else Respond 401) → Send Email to recipient → signed POST write-back `/api/automation-events`
   (kind `request_notification_sent`, key `notify:{eventId}`) → **Respond 200 last**.
   So outbox `sent` means "email sent and recorded". If any step fails, n8n returns non-2xx/timeout →
   Convex retries. Delivery is **at-least-once**: a retry after a lost 200 could resend an email
   (acceptable, documented); the write-back stays deduplicated by key.
   Minimal payload: `{ eventId, event: "loan.requested" | "loan.approved" | ..., recipient: { email, name },
   toolName, startDate, endDate }`. Recipient = owner for `requested`/`cancelled`, borrower for
   `approved`/`declined`/`returned`. No other user's email, no description, no internal ids except eventId
   (and loanId for the write-back).

### 6.3 Workflow 2 — Overdue reminders
1. Schedule Trigger daily 09:00 UTC (plus manual trigger for demo).
2. Signed GET `/api/overdue-loans` → `[{ loanId, borrower: { email, name }, toolName, endDate, daysOverdue }]`.
3. Split items → Send Email → signed POST `/api/automation-events` with key
   `reminder:{loanId}:{YYYY-MM-DD}` (today UTC), kind `overdue_reminder_sent`.
4. Convex write-back mutation: if key exists → return existing (200, `duplicate: true`), else insert.
   Convex mutations are serializable transactions, so check-then-insert on an index is race-safe.
5. Overdue endpoint excludes loans already reminded today → re-running the cron the same day sends nothing new.

### 6.4 Failure handling
- HTTP Request and Send Email nodes: Retry On Fail (3 tries, 2s wait).
- Both workflows set an **Error Workflow** (`LendLoop — Error handler`): emails the ops address via Mailpit
  and posts a signed `/api/workflow-errors` record (workflow name, executionId, node, message) so it
  shows in the admin view.
- Cloudflare Quick Tunnel URL changes on every restart → README setup step:
  `npx convex env set N8N_WEBHOOK_URL https://<new>.trycloudflare.com/webhook/lendloop-loan-events`.
- Convex side: failed outbox rows are listed in the admin view with `lastError`.

## 7. UI (Next.js App Router + Tailwind)
- `/` public: LendLoop name, tagline "Borrow what you need. Lend what you don't.", available tools
  (name + category), "Sign in to lend or borrow" (Clerk).
- `/tools` catalog: all tools, availability badge, category filter, request button opens date-range form.
- `/my/listings` (create/edit/delete own tools), `/my/requests` (own borrowing, cancel),
  `/my/incoming` (approve / decline / mark returned).
- `/admin`: all loans, delete any listing, toggle Trusted Lender, failed outbox deliveries.
- Each loan card shows latest automation activity: "Reminder sent 2 days ago".
- Minimal, clean layout; loading/empty/error states; server errors surfaced as toast/inline text.

## 8. Testing
- Vitest + `convex-test` for Convex functions: role/ownership checks, state machine, overlap rule,
  idempotent write-back, overdue selection.
- Pure unit tests for HMAC sign/verify (valid, tampered body, wrong secret, stale timestamp).
- `tsc --noEmit` and lint clean.
- Manual E2E (documented in README): sign in → list → request (second user) → approve → email in Mailpit
  → force overdue (seed/dev mutation that backdates a loan) → run reminder workflow → activity shows in app
  → re-run → no duplicate.

## 9. Repo deliverables
- `n8n/workflows/*.json` exported without credentials (checked by a `scripts/check-secrets` grep).
- `docker-compose.yml` (n8n + Mailpit), `.env.example` files (no real values).
- README: setup, env vars table, architecture diagram (Mermaid), security & data-minimization decisions,
  "What I'd change in production" (managed secrets e.g. AWS Secrets Manager, n8n on a managed host/ECS,
  queue-based outbox, monitoring with Sentry/Datadog, per-request nonce store, key rotation) — as plans only.

## 10. Calls made by Claude (not discussed with Enzo)
- Role lives in Convex `users` table, bootstrapped via `ADMIN_EMAILS` env.
- Soft delete for tools.
- Two separate secrets (one per direction).
- Signed-string format includes method + path.
- Cloudflare Quick Tunnel for Convex → n8n.
- Category/condition enums as listed.
- Outbox table with scheduler-based retries; n8n responds after email + write-back (at-least-once).
- Auto-decline overlapping requests on approve; auto-cancel pending on tool delete; owner can't delete
  a tool with an active loan, admin can.
- Admin requires verified email.
- n8n errors stored in a separate `workflowErrors` table.

## 11. Left to the builder
File layout inside `app/` and `convex/`, component breakdown, exact styling, toast library (or none).
