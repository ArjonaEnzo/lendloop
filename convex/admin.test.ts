/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertLoan, makeUser, NOW, sampleTool, TODAY } from "../test-utils/fixtures";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.ADMIN_EMAILS = "admin@example.com";
});
afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

async function setup() {
  const t = convexTest(schema, modules);
  const owner = await makeUser(t, "owner");
  const bob = await makeUser(t, "bob");
  const admin = await makeUser(t, "admin", { admin: true });
  return { t, owner, bob, admin };
}

describe("admin functions are admin-only (enforced in Convex)", () => {
  test("a regular user is refused everywhere", async () => {
    const { bob, owner } = await setup();
    await expect(bob.as.query(api.admin.allLoans, { today: TODAY })).rejects.toThrow("Admin only");
    await expect(bob.as.query(api.admin.users, {})).rejects.toThrow("Admin only");
    await expect(bob.as.query(api.admin.failedDeliveries, {})).rejects.toThrow("Admin only");
    await expect(bob.as.query(api.admin.workflowErrors, {})).rejects.toThrow("Admin only");
    await expect(
      bob.as.mutation(api.admin.setTrustedLender, { userId: owner.userId, trusted: true }),
    ).rejects.toThrow("Admin only");
  });

  test("a stored admin role is ignored if the live token is not an admin", async () => {
    const { t } = await setup();
    // Row says admin, but email is not in ADMIN_EMAILS -> must be refused.
    const sneaky = await makeUser(t, "sneaky", { admin: true });
    await expect(sneaky.as.query(api.admin.users, {})).rejects.toThrow("Admin only");
  });
});

describe("admin views and actions", () => {
  test("sees all loans", async () => {
    const { t, owner, bob, admin } = await setup();
    const toolId = await owner.as.mutation(api.tools.create, sampleTool);
    await insertLoan(t, {
      toolId,
      borrowerId: bob.userId,
      ownerId: owner.userId,
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      status: "returned",
    });
    const loans = await admin.as.query(api.admin.allLoans, { today: TODAY });
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ toolName: "Cordless drill", ownerName: "Owner", borrowerName: "Bob" });
  });

  test("marks a Trusted Lender, visible in the catalog", async () => {
    const { owner, bob, admin } = await setup();
    await owner.as.mutation(api.tools.create, sampleTool);
    await admin.as.mutation(api.admin.setTrustedLender, { userId: owner.userId, trusted: true });
    const catalog = await bob.as.query(api.tools.listCatalog, { today: TODAY });
    expect(catalog[0].ownerTrusted).toBe(true);
    const users = await admin.as.query(api.admin.users, {});
    expect(users.find((u) => u.name === "Owner")?.trustedLender).toBe(true);
    expect(JSON.stringify(users)).not.toContain("@example.com");
  });

  test("lists failed deliveries and workflow errors", async () => {
    const { t, admin } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("outbox", {
        eventId: "loan:x:requested:1",
        payload: {},
        status: "failed",
        attempts: 4,
        lastError: "HTTP 502",
      });
      await ctx.db.insert("outbox", { eventId: "ok", payload: {}, status: "sent", attempts: 1 });
      await ctx.db.insert("workflowErrors", {
        idempotencyKey: "error:9",
        workflowName: "LendLoop — Overdue reminders",
        executionId: "9",
        message: "SMTP down",
        createdAt: NOW,
      });
    });
    const failed = await admin.as.query(api.admin.failedDeliveries, {});
    expect(failed).toEqual([
      expect.objectContaining({ eventId: "loan:x:requested:1", attempts: 4, lastError: "HTTP 502" }),
    ]);
    expect(failed[0]).not.toHaveProperty("payload");
    const errors = await admin.as.query(api.admin.workflowErrors, {});
    expect(errors[0]).toMatchObject({ workflowName: "LendLoop — Overdue reminders", message: "SMTP down" });
  });
});
