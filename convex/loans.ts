import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isOverdue, isValidDate, rangesOverlap, todayUtc } from "./lib/dates";
import { enqueueLoanEvent } from "./lib/outbox";
import type { LoanStatus } from "./lib/payloads";
import { getLiveTool } from "./tools";

const MAX_PENDING_PER_BORROWER = 10;
// Every request and every cancel emails the owner. The pending cap alone does not stop a
// request -> cancel loop, so new requests are also capped per rolling 24 hours.
const MAX_REQUESTS_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 200;

// ---------- Helpers ----------

async function getLoan(ctx: QueryCtx, loanId: Id<"loans">): Promise<Doc<"loans">> {
  const loan = await ctx.db.get("loans", loanId);
  if (!loan) throw new ConvexError("Loan not found");
  return loan;
}

const ACTION_LABEL = {
  approved: "approve",
  declined: "decline",
  cancelled: "cancel",
  returned: "mark returned",
} as const;

/** The only legal moves. Anything else throws, e.g. "Cannot approve a declined loan". */
const ALLOWED_FROM: Record<keyof typeof ACTION_LABEL, LoanStatus> = {
  approved: "requested",
  declined: "requested",
  cancelled: "requested",
  returned: "approved",
};

function assertTransition(loan: Doc<"loans">, to: keyof typeof ACTION_LABEL) {
  if (loan.status !== ALLOWED_FROM[to]) {
    throw new ConvexError(`Cannot ${ACTION_LABEL[to]} a ${loan.status} loan`);
  }
}

/** Patches the status and enqueues the notification in the same transaction. */
async function setStatus(ctx: MutationCtx, loan: Doc<"loans">, status: LoanStatus) {
  const now = Date.now();
  const patch = { status, updatedAt: now, ...(status === "returned" ? { returnedAt: now } : {}) };
  await ctx.db.patch("loans", loan._id, patch);
  await enqueueLoanEvent(ctx, { ...loan, ...patch });
}

async function requireOwnerOf(ctx: MutationCtx, loan: Doc<"loans">) {
  const me = await requireUser(ctx);
  if (loan.ownerId !== me._id) throw new ConvexError("Not your tool");
  return me;
}

// ---------- Borrower actions ----------

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const me = await requireUser(ctx);
    if (!isValidDate(startDate) || !isValidDate(endDate)) throw new ConvexError("Invalid date");
    if (startDate < todayUtc(Date.now())) throw new ConvexError("Start date can't be in the past");
    if (endDate < startDate) throw new ConvexError("End date must be on or after the start date");

    const tool = await getLiveTool(ctx, toolId);
    if (tool.ownerId === me._id) throw new ConvexError("You can't borrow your own tool");

    const myLoans = await ctx.db
      .query("loans")
      .withIndex("by_borrowerId", (q) => q.eq("borrowerId", me._id))
      .order("desc")
      .take(LIST_LIMIT);
    const now = Date.now();
    const madeToday = myLoans.filter((l) => l._creationTime > now - DAY_MS).length;
    if (madeToday >= MAX_REQUESTS_PER_DAY) throw new ConvexError("Too many requests today, try again tomorrow");

    const myPending = myLoans.filter((l) => l.status === "requested");
    if (myPending.length >= MAX_PENDING_PER_BORROWER) throw new ConvexError("Too many pending requests");
    const duplicate = myPending.some(
      (l) => l.toolId === toolId && rangesOverlap(l.startDate, l.endDate, startDate, endDate),
    );
    if (duplicate) throw new ConvexError("You already requested these dates");

    const loanId = await ctx.db.insert("loans", {
      toolId,
      borrowerId: me._id,
      ownerId: tool.ownerId,
      startDate,
      endDate,
      status: "requested",
      updatedAt: now,
    });
    await enqueueLoanEvent(ctx, (await ctx.db.get("loans", loanId))!);
    return loanId;
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    if (loan.borrowerId !== me._id) throw new ConvexError("Not your request");
    assertTransition(loan, "cancelled");
    await setStatus(ctx, loan, "cancelled");
    return null;
  },
});

// ---------- Owner actions ----------

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    await requireOwnerOf(ctx, loan);
    assertTransition(loan, "approved");

    const approved = await ctx.db
      .query("loans")
      .withIndex("by_toolId_and_status", (q) => q.eq("toolId", loan.toolId).eq("status", "approved"))
      .take(LIST_LIMIT);
    if (approved.some((l) => rangesOverlap(l.startDate, l.endDate, loan.startDate, loan.endDate))) {
      throw new ConvexError("Dates overlap an approved loan");
    }

    await setStatus(ctx, loan, "approved");

    // Competing requests for the same days can never be approved now: decline them so nobody waits.
    const pending = await ctx.db
      .query("loans")
      .withIndex("by_toolId_and_status", (q) => q.eq("toolId", loan.toolId).eq("status", "requested"))
      .take(LIST_LIMIT);
    for (const other of pending) {
      if (rangesOverlap(other.startDate, other.endDate, loan.startDate, loan.endDate)) {
        await setStatus(ctx, other, "declined");
      }
    }
    return null;
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    await requireOwnerOf(ctx, loan);
    assertTransition(loan, "declined");
    await setStatus(ctx, loan, "declined");
    return null;
  },
});

/** Only the owner confirms a return: they are the one who gets the tool back. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    await requireOwnerOf(ctx, loan);
    assertTransition(loan, "returned");
    await setStatus(ctx, loan, "returned");
    return null;
  },
});

// ---------- Views ----------

/** Latest automation write-back for a loan (e.g. "Reminder sent"). */
async function lastActivityFor(ctx: QueryCtx, loanId: Id<"loans">) {
  const event = await ctx.db
    .query("automationEvents")
    .withIndex("by_loanId", (q) => q.eq("loanId", loanId))
    .order("desc")
    .first();
  return event ? { kind: event.kind, createdAt: event.createdAt } : null;
}

export async function toLoanView(
  ctx: QueryCtx,
  loan: Doc<"loans">,
  today: string,
  counterpartId: Id<"users">,
) {
  const [tool, counterpart] = await Promise.all([
    ctx.db.get("tools", loan.toolId),
    ctx.db.get("users", counterpartId),
  ]);
  return {
    _id: loan._id,
    toolName: tool?.name ?? "Deleted tool",
    status: loan.status,
    startDate: loan.startDate,
    endDate: loan.endDate,
    counterpartName: counterpart?.name ?? "Unknown",
    overdue: loan.status === "approved" && isOverdue(loan.endDate, today),
    lastActivity: await lastActivityFor(ctx, loan._id),
  };
}

export const myRequests = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const me = await requireUser(ctx);
    if (!isValidDate(today)) throw new ConvexError("Invalid date");
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrowerId", (q) => q.eq("borrowerId", me._id))
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(loans.map((l) => toLoanView(ctx, l, today, l.ownerId)));
  },
});

export const incoming = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const me = await requireUser(ctx);
    if (!isValidDate(today)) throw new ConvexError("Invalid date");
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", me._id))
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(loans.map((l) => toLoanView(ctx, l, today, l.borrowerId)));
  },
});
