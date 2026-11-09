/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { insertLoan, makeUser, NOW, sampleTool, TODAY } from "../test-utils/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW); // "today" is 2026-11-08 UTC
  process.env.ADMIN_EMAILS = "admin@example.com";
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.ADMIN_EMAILS;
});

async function setup() {
  const t = convexTest(schema, modules);
  const owner = await makeUser(t, "owner");
  const bob = await makeUser(t, "bob");
  const carol = await makeUser(t, "carol");
  const admin = await makeUser(t, "admin", { admin: true });
  const toolId = await owner.as.mutation(api.tools.create, sampleTool);
  return { t, owner, bob, carol, admin, toolId };
}

const range = { startDate: "2026-11-10", endDate: "2026-11-12" };

async function outboxRows(t: ReturnType<typeof convexTest>) {
  return await t.run((ctx) => ctx.db.query("outbox").take(100));
}
async function statusOf(t: ReturnType<typeof convexTest>, loanId: Id<"loans">) {
  return await t.run(async (ctx) => (await ctx.db.get("loans", loanId))!.status);
}

describe("loans.request", () => {
  test("creates a requested loan and notifies the owner", async () => {
    const { t, bob, toolId } = await setup();
    const loanId = await bob.as.mutation(api.loans.request, { toolId, ...range });
    expect(await statusOf(t, loanId)).toBe("requested");
    const rows = await outboxRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.event).toBe("loan.requested");
    expect(rows[0].payload.recipient).toEqual({ email: "owner@example.com", name: "Owner" });
  });

  test("rejects borrowing your own tool", async () => {
    const { owner, toolId } = await setup();
    await expect(owner.as.mutation(api.loans.request, { toolId, ...range })).rejects.toThrow(
      "You can't borrow your own tool",
    );
  });

  test("rejects bad dates", async () => {
    const { bob, toolId } = await setup();
    await expect(
      bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-31", endDate: "2026-12-01" }),
    ).rejects.toThrow("Invalid date");
    await expect(
      bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-07", endDate: "2026-11-09" }),
    ).rejects.toThrow("Start date can't be in the past");
    await expect(
      bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-12", endDate: "2026-11-10" }),
    ).rejects.toThrow("End date must be on or after the start date");
  });

  test("accepts a loan starting today", async () => {
    const { bob, toolId } = await setup();
    await bob.as.mutation(api.loans.request, { toolId, startDate: TODAY, endDate: TODAY });
  });

  test("rejects a deleted tool", async () => {
    const { owner, bob, toolId } = await setup();
    await owner.as.mutation(api.tools.remove, { toolId });
    await expect(bob.as.mutation(api.loans.request, { toolId, ...range })).rejects.toThrow("Tool not found");
  });

  test("rejects a duplicate overlapping pending request by the same borrower", async () => {
    const { bob, toolId } = await setup();
    await bob.as.mutation(api.loans.request, { toolId, ...range });
    await expect(
      bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-11", endDate: "2026-11-15" }),
    ).rejects.toThrow("You already requested these dates");
  });

  test("rejects the 11th pending request of a borrower", async () => {
    const { t, owner, bob } = await setup();
    for (let i = 0; i < 10; i++) {
      const id = await owner.as.mutation(api.tools.create, { ...sampleTool, name: `T${i}` });
      await bob.as.mutation(api.loans.request, { toolId: id, ...range });
    }
    const extra = await owner.as.mutation(api.tools.create, { ...sampleTool, name: "Extra" });
    await expect(bob.as.mutation(api.loans.request, { toolId: extra, ...range })).rejects.toThrow(
      "Too many pending requests",
    );
    expect((await outboxRows(t)).length).toBe(10);
  });
});

describe("state machine", () => {
  test("only the owner can approve, decline or mark returned", async () => {
    const { bob, carol, admin, toolId } = await setup();
    const loanId = await bob.as.mutation(api.loans.request, { toolId, ...range });
    for (const actor of [bob, carol, admin]) {
      await expect(actor.as.mutation(api.loans.approve, { loanId })).rejects.toThrow("Not your tool");
      await expect(actor.as.mutation(api.loans.decline, { loanId })).rejects.toThrow("Not your tool");
    }
  });

  test("only the borrower can cancel", async () => {
    const { owner, carol, bob, toolId } = await setup();
    const loanId = await bob.as.mutation(api.loans.request, { toolId, ...range });
    await expect(owner.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow("Not your request");
    await expect(carol.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow("Not your request");
  });

  test("happy path: requested -> approved -> returned, one outbox row per step", async () => {
    const { t, owner, bob, toolId } = await setup();
    const loanId = await bob.as.mutation(api.loans.request, { toolId, ...range });
    await owner.as.mutation(api.loans.approve, { loanId });
    expect(await statusOf(t, loanId)).toBe("approved");
    await owner.as.mutation(api.loans.markReturned, { loanId });
    expect(await statusOf(t, loanId)).toBe("returned");
    const events = (await outboxRows(t)).map((r) => [r.payload.event, r.payload.recipient.name]);
    expect(events).toEqual([
      ["loan.requested", "Owner"],
      ["loan.approved", "Bob"],
      ["loan.returned", "Bob"],
    ]);
  });

  test("illegal transitions are refused", async () => {
    const { owner, bob, toolId } = await setup();
    const loanId = await bob.as.mutation(api.loans.request, { toolId, ...range });
    await expect(owner.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(
      "Cannot mark returned a requested loan",
    );
    await owner.as.mutation(api.loans.decline, { loanId });
    await expect(owner.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(
      "Cannot approve a declined loan",
    );
    await expect(bob.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(
      "Cannot cancel a declined loan",
    );
  });

  test("approving auto-declines overlapping requests and keeps the others", async () => {
    const { t, owner, bob, carol, admin, toolId } = await setup();
    const a = await bob.as.mutation(api.loans.request, { toolId, ...range });
    const overlapping = await carol.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-12",
      endDate: "2026-11-14",
    });
    const later = await admin.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    });
    await owner.as.mutation(api.loans.approve, { loanId: a });
    expect(await statusOf(t, overlapping)).toBe("declined");
    expect(await statusOf(t, later)).toBe("requested");
    const declinedNotice = (await outboxRows(t)).find(
      (r) => r.payload.event === "loan.declined",
    );
    expect(declinedNotice?.payload.recipient.name).toBe("Carol");
  });

  test("cannot approve dates that overlap an approved loan", async () => {
    const { t, owner, bob, carol, toolId } = await setup();
    const approved = await insertLoan(t, {
      toolId,
      borrowerId: carol.userId,
      ownerId: owner.userId,
      startDate: "2026-11-11",
      endDate: "2026-11-13",
      status: "approved",
    });
    // Inserted directly, so bypassing auto-decline: simulates two requests racing.
    const b = await insertLoan(t, {
      toolId,
      borrowerId: bob.userId,
      ownerId: owner.userId,
      ...range,
      status: "requested",
    });
    expect(approved).toBeDefined();
    await expect(owner.as.mutation(api.loans.approve, { loanId: b })).rejects.toThrow(
      "Dates overlap an approved loan",
    );
  });

  test("removing a tool declines its pending requests and notifies the borrower", async () => {
    const { t, owner, bob, toolId } = await setup();
    const loanId = await bob.as.mutation(api.loans.request, { toolId, ...range });
    await owner.as.mutation(api.tools.remove, { toolId });
    expect(await statusOf(t, loanId)).toBe("declined");
    const notice = (await outboxRows(t)).find((r) => r.payload.event === "loan.declined");
    expect(notice?.payload.recipient.name).toBe("Bob");
  });
});

describe("views", () => {
  test("myRequests and incoming only show the caller's loans, with overdue flag", async () => {
    const { t, owner, bob, carol, toolId } = await setup();
    await insertLoan(t, {
      toolId,
      borrowerId: bob.userId,
      ownerId: owner.userId,
      startDate: "2026-11-01",
      endDate: "2026-11-07",
      status: "approved",
    });
    await insertLoan(t, {
      toolId,
      borrowerId: carol.userId,
      ownerId: owner.userId,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
      status: "requested",
    });

    const bobs = await bob.as.query(api.loans.myRequests, { today: TODAY });
    expect(bobs).toHaveLength(1);
    expect(bobs[0]).toMatchObject({
      toolName: "Cordless drill",
      status: "approved",
      counterpartName: "Owner",
      overdue: true,
      lastActivity: null,
    });

    const incoming = await owner.as.query(api.loans.incoming, { today: TODAY });
    expect(incoming.map((l) => l.counterpartName).sort()).toEqual(["Bob", "Carol"]);
    expect(JSON.stringify(incoming)).not.toContain("@example.com");

    expect(await carol.as.query(api.loans.incoming, { today: TODAY })).toEqual([]);
  });

  test("lastActivity is the most recent automation write-back, on every loan view", async () => {
    const { t, owner, bob, admin, toolId } = await setup();
    const loanId = await insertLoan(t, {
      toolId,
      borrowerId: bob.userId,
      ownerId: owner.userId,
      startDate: "2026-11-01",
      endDate: "2026-11-07",
      status: "approved",
    });

    await t.mutation(internal.automation.record, {
      idempotencyKey: `notify:loan:${loanId}:approved:1`,
      loanId,
      kind: "request_notification_sent",
    });
    vi.advanceTimersByTime(60_000);
    await t.mutation(internal.automation.record, {
      idempotencyKey: `reminder:${loanId}:${TODAY}`,
      loanId,
      kind: "overdue_reminder_sent",
    });

    const expected = { kind: "overdue_reminder_sent", createdAt: NOW + 60_000 };
    const [mine] = await bob.as.query(api.loans.myRequests, { today: TODAY });
    expect(mine.lastActivity).toEqual(expected);
    const [theirs] = await owner.as.query(api.loans.incoming, { today: TODAY });
    expect(theirs.lastActivity).toEqual(expected);
    const [adminView] = await admin.as.query(api.admin.allLoans, { today: TODAY });
    expect(adminView.lastActivity).toEqual(expected);
  });
});
