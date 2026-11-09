/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { insertLoan, makeUser, NOW, sampleTool } from "../test-utils/fixtures";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.ALLOW_DEV_TOOLS;
});

async function setup() {
  const t = convexTest(schema, modules);
  const owner = await makeUser(t, "owner");
  const bob = await makeUser(t, "bob");
  const toolId = await owner.as.mutation(api.tools.create, sampleTool);
  const loanId = await insertLoan(t, {
    toolId,
    borrowerId: bob.userId,
    ownerId: owner.userId,
    startDate: "2026-11-01",
    endDate: "2026-11-02",
    status: "returned",
  });
  return { t, loanId };
}

describe("dev.seedOverdueLoan", () => {
  test("refuses unless ALLOW_DEV_TOOLS=true", async () => {
    const { t, loanId } = await setup();
    await expect(
      t.mutation(internal.dev.seedOverdueLoan, { fromLoanId: loanId, daysOverdue: 3 }),
    ).rejects.toThrow("Dev tools disabled");
  });

  test("creates an approved loan that ended N days ago (same tool and people)", async () => {
    process.env.ALLOW_DEV_TOOLS = "true";
    const { t, loanId } = await setup();
    const newId = await t.mutation(internal.dev.seedOverdueLoan, { fromLoanId: loanId, daysOverdue: 3 });
    const [src, loan] = await t.run(async (ctx) => [
      await ctx.db.get("loans", loanId),
      await ctx.db.get("loans", newId),
    ]);
    expect(loan).toMatchObject({
      status: "approved",
      endDate: "2026-11-05",
      toolId: src!.toolId,
      borrowerId: src!.borrowerId,
      ownerId: src!.ownerId,
    });
    expect(loan!.startDate <= loan!.endDate).toBe(true);
  });
});
