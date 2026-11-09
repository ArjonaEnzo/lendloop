import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { buildLoanEventPayload, eventIdFor, recipientRoleFor } from "./payloads";

/**
 * Records a loan state change in the outbox, inside the same transaction as the change.
 * If the mutation rolls back, the outbox row rolls back too: no notification for a change
 * that never happened, and no change without its notification.
 * Delivery to n8n happens later in an action (convex/outbox.ts).
 */
export async function enqueueLoanEvent(ctx: MutationCtx, loan: Doc<"loans">): Promise<void> {
  const eventId = eventIdFor(loan._id, loan.status, loan.updatedAt);
  const existing = await ctx.db
    .query("outbox")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
  if (existing) return; // idempotent: same state change enqueued once

  const tool = await ctx.db.get("tools", loan.toolId);
  const recipientId = recipientRoleFor(loan.status) === "owner" ? loan.ownerId : loan.borrowerId;
  const recipient = await ctx.db.get("users", recipientId);
  if (!tool || !recipient) return;

  const payload = buildLoanEventPayload({
    eventId,
    loanId: loan._id,
    status: loan.status,
    toolName: tool.name,
    startDate: loan.startDate,
    endDate: loan.endDate,
    recipient: { email: recipient.email, name: recipient.name },
  });

  await ctx.db.insert("outbox", { eventId, payload, status: "pending", attempts: 0 });
  // Task 7 adds: schedule delivery with ctx.scheduler.runAfter(0, ...)
}
