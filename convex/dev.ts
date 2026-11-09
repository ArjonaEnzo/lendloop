import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { todayUtc } from "./lib/dates";

// Dev-only helpers for demos (e.g. the overdue-reminder workflow). Internal: not callable from
// the browser. Also refuses to run unless the deployment sets ALLOW_DEV_TOOLS=true.
// Run with: npx convex run dev:seedOverdueLoan '{"fromLoanId":"...","daysOverdue":3}'

const DAY_MS = 24 * 60 * 60 * 1000;

export const seedOverdueLoan = internalMutation({
  args: { fromLoanId: v.id("loans"), daysOverdue: v.number() },
  handler: async (ctx, { fromLoanId, daysOverdue }) => {
    if (process.env.ALLOW_DEV_TOOLS !== "true") throw new Error("Dev tools disabled");
    const src = await ctx.db.get("loans", fromLoanId);
    if (!src) throw new Error("Loan not found");
    const now = Date.now();
    const endDate = todayUtc(now - daysOverdue * DAY_MS);
    const startDate = todayUtc(now - (daysOverdue + 2) * DAY_MS);
    return await ctx.db.insert("loans", {
      toolId: src.toolId,
      borrowerId: src.borrowerId,
      ownerId: src.ownerId,
      startDate,
      endDate,
      status: "approved",
      updatedAt: now,
    });
  },
});
