import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { automationKindV } from "./schema";
import { daysBetween } from "./lib/dates";

// Functions behind the signed HTTP endpoints used by n8n (convex/http.ts).
// All internal: only the HTTP actions call them, after the HMAC check.

const OVERDUE_LIMIT = 200;

export const reminderKey = (loanId: string, today: string) => `reminder:${loanId}:${today}`;

/** Approved loans whose endDate is before today (UTC), minus those already reminded today. */
export const overdue = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_and_endDate", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(OVERDUE_LIMIT);

    const out = [];
    for (const loan of loans) {
      const reminded = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", reminderKey(loan._id, today)))
        .unique();
      if (reminded) continue;
      const borrower = await ctx.db.get("users", loan.borrowerId);
      const tool = await ctx.db.get("tools", loan.toolId);
      if (!borrower || !tool) continue;
      // Only what the reminder email needs: no owner data, no description.
      out.push({
        loanId: loan._id as string,
        borrower: { email: borrower.email, name: borrower.name },
        toolName: tool.name,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
      });
    }
    return out;
  },
});

/** The key must belong to the loan and match the kind, so a key cannot be reused across loans. */
function keyMatches(kind: "request_notification_sent" | "overdue_reminder_sent", key: string, loanId: string) {
  if (kind === "request_notification_sent") return key.startsWith(`notify:loan:${loanId}:`);
  return new RegExp(`^reminder:${loanId}:\\d{4}-\\d{2}-\\d{2}$`).test(key);
}

export const record = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.string(),
    kind: automationKindV,
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ result: "created" | "duplicate" | "invalid" }> => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    if (!loanId || !(await ctx.db.get("loans", loanId))) return { result: "invalid" };
    if (!keyMatches(args.kind, args.idempotencyKey, loanId)) return { result: "invalid" };

    // Mutations are serializable transactions: lookup-then-insert on the index is race-safe.
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) return { result: "duplicate" };

    await ctx.db.insert("automationEvents", {
      idempotencyKey: args.idempotencyKey,
      loanId,
      kind: args.kind,
      detail: args.detail,
      createdAt: Date.now(),
    });
    return { result: "created" };
  },
});

export const recordError = internalMutation({
  args: {
    executionId: v.string(),
    workflowName: v.string(),
    nodeName: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<{ result: "created" | "duplicate" }> => {
    const idempotencyKey = `error:${args.executionId}`;
    const existing = await ctx.db
      .query("workflowErrors")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();
    if (existing) return { result: "duplicate" };
    await ctx.db.insert("workflowErrors", { idempotencyKey, ...args, createdAt: Date.now() });
    return { result: "created" };
  },
});
