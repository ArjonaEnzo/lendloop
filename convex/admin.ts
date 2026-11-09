import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { isValidDate } from "./lib/dates";
import { toLoanView } from "./loans";

// Every function here starts with requireAdmin: the check lives on the server,
// so hiding the Admin link in the UI is only cosmetic.

const LIST_LIMIT = 200;

export const allLoans = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    await requireAdmin(ctx);
    if (!isValidDate(today)) throw new ConvexError("Invalid date");
    const loans = await ctx.db.query("loans").order("desc").take(LIST_LIMIT);
    return await Promise.all(
      loans.map(async (loan) => {
        const view = await toLoanView(ctx, loan, today, loan.borrowerId);
        const owner = await ctx.db.get("users", loan.ownerId);
        return {
          ...view,
          borrowerName: view.counterpartName,
          ownerName: owner?.name ?? "Unknown",
        };
      }),
    );
  },
});

/** Users for the Trusted Lender toggle. No emails. */
export const users = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("users").take(LIST_LIMIT);
    return rows.map((u) => ({ _id: u._id, name: u.name, role: u.role, trustedLender: u.trustedLender }));
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", userId);
    if (!user) throw new ConvexError("User not found");
    await ctx.db.patch("users", userId, { trustedLender: trusted });
    return null;
  },
});

/** Convex -> n8n deliveries that exhausted their retries. Payload (with emails) is not returned. */
export const failedDeliveries = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("outbox")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(LIST_LIMIT);
    return rows.map((r) => ({
      _id: r._id,
      eventId: r.eventId,
      attempts: r.attempts,
      lastError: r.lastError ?? null,
      createdAt: r._creationTime,
    }));
  },
});

export const workflowErrors = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("workflowErrors").order("desc").take(LIST_LIMIT);
    return rows.map((r) => ({
      _id: r._id,
      workflowName: r.workflowName,
      executionId: r.executionId,
      nodeName: r.nodeName ?? null,
      message: r.message,
      createdAt: r.createdAt,
    }));
  },
});
