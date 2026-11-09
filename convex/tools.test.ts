/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertLoan, makeUser, sampleTool, TODAY } from "../test-utils/fixtures";
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
  const alice = await makeUser(t, "alice");
  const bob = await makeUser(t, "bob");
  const admin = await makeUser(t, "admin", { admin: true });
  return { t, alice, bob, admin };
}

describe("tools.listPublic", () => {
  test("works signed out and returns only name and category", async () => {
    const { t, alice } = await setup();
    await alice.as.mutation(api.tools.create, sampleTool);
    const rows = await t.query(api.tools.listPublic, { today: TODAY });
    expect(rows).toEqual([{ name: "Cordless drill", category: "power_tools" }]);
    expect(Object.keys(rows[0]).sort()).toEqual(["category", "name"]);
  });

  test("hides deleted tools and tools lent out today", async () => {
    const { t, alice, bob } = await setup();
    const lent = await alice.as.mutation(api.tools.create, { ...sampleTool, name: "Ladder" });
    const gone = await alice.as.mutation(api.tools.create, { ...sampleTool, name: "Old saw" });
    await alice.as.mutation(api.tools.create, { ...sampleTool, name: "Rake" });
    await insertLoan(t, {
      toolId: lent,
      borrowerId: bob.userId,
      ownerId: alice.userId,
      startDate: "2026-11-07",
      endDate: "2026-11-10",
      status: "approved",
    });
    await alice.as.mutation(api.tools.remove, { toolId: gone });
    const names = (await t.query(api.tools.listPublic, { today: TODAY })).map((r) => r.name);
    expect(names).toEqual(["Rake"]);
  });

  test("rejects an invalid today argument", async () => {
    const { t } = await setup();
    await expect(t.query(api.tools.listPublic, { today: "yesterday" })).rejects.toThrow("Invalid date");
  });
});

describe("tools.create", () => {
  test("trims input and stores the tool for the caller", async () => {
    const { alice } = await setup();
    await alice.as.mutation(api.tools.create, { ...sampleTool, name: "  Drill  " });
    const mine = await alice.as.query(api.tools.myListings, { today: TODAY });
    expect(mine.map((r) => r.name)).toEqual(["Drill"]);
  });

  test("rejects an empty name, a name over 80 chars and a description over 500 chars", async () => {
    const { alice } = await setup();
    await expect(alice.as.mutation(api.tools.create, { ...sampleTool, name: "   " })).rejects.toThrow(
      "Name is required",
    );
    await expect(
      alice.as.mutation(api.tools.create, { ...sampleTool, name: "x".repeat(81) }),
    ).rejects.toThrow("Name is too long");
    await expect(
      alice.as.mutation(api.tools.create, { ...sampleTool, description: "x".repeat(501) }),
    ).rejects.toThrow("Description is too long");
  });

  test("rejects the 51st tool for the same user", async () => {
    const { t, alice } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 50; i++) {
        await ctx.db.insert("tools", { ...sampleTool, name: `Tool ${i}`, ownerId: alice.userId });
      }
    });
    await expect(alice.as.mutation(api.tools.create, sampleTool)).rejects.toThrow("Listing limit reached");
  });

  test("requires sign-in", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.tools.create, sampleTool)).rejects.toThrow("Not signed in");
  });
});

describe("tools.update / tools.remove ownership", () => {
  test("a non-owner cannot update or remove", async () => {
    const { alice, bob } = await setup();
    const toolId = await alice.as.mutation(api.tools.create, sampleTool);
    await expect(
      bob.as.mutation(api.tools.update, { toolId, ...sampleTool, name: "Mine now" }),
    ).rejects.toThrow("Not your tool");
    await expect(bob.as.mutation(api.tools.remove, { toolId })).rejects.toThrow("Not your tool");
  });

  test("the owner can update", async () => {
    const { alice } = await setup();
    const toolId = await alice.as.mutation(api.tools.create, sampleTool);
    await alice.as.mutation(api.tools.update, { toolId, ...sampleTool, name: "Impact drill" });
    const mine = await alice.as.query(api.tools.myListings, { today: TODAY });
    expect(mine[0].name).toBe("Impact drill");
  });

  test("an admin can remove any listing but cannot edit it", async () => {
    const { admin, alice } = await setup();
    const toolId = await alice.as.mutation(api.tools.create, sampleTool);
    await expect(
      admin.as.mutation(api.tools.update, { toolId, ...sampleTool, name: "Edited by admin" }),
    ).rejects.toThrow("Not your tool");
    await admin.as.mutation(api.tools.remove, { toolId });
    expect(await alice.as.query(api.tools.myListings, { today: TODAY })).toEqual([]);
  });

  test("the owner cannot remove a tool that is lent out; an admin can", async () => {
    const { t, alice, bob, admin } = await setup();
    const toolId = await alice.as.mutation(api.tools.create, sampleTool);
    await insertLoan(t, {
      toolId,
      borrowerId: bob.userId,
      ownerId: alice.userId,
      startDate: "2026-11-01",
      endDate: "2026-11-20",
      status: "approved",
    });
    await expect(alice.as.mutation(api.tools.remove, { toolId })).rejects.toThrow(
      "Tool is currently lent out",
    );
    await admin.as.mutation(api.tools.remove, { toolId });
  });

  test("a deleted tool cannot be updated", async () => {
    const { alice } = await setup();
    const toolId = await alice.as.mutation(api.tools.create, sampleTool);
    await alice.as.mutation(api.tools.remove, { toolId });
    await expect(alice.as.mutation(api.tools.update, { toolId, ...sampleTool })).rejects.toThrow(
      "Tool not found",
    );
  });

});

describe("tools.listCatalog", () => {
  test("filters by category, flags my tools and availability, never leaks email", async () => {
    const { t, alice, bob } = await setup();
    const drill = await alice.as.mutation(api.tools.create, sampleTool);
    await bob.as.mutation(api.tools.create, { ...sampleTool, name: "Tent", category: "camping" });
    await insertLoan(t, {
      toolId: drill,
      borrowerId: bob.userId,
      ownerId: alice.userId,
      startDate: TODAY,
      endDate: TODAY,
      status: "approved",
    });

    const all = await bob.as.query(api.tools.listCatalog, { today: TODAY });
    expect(all).toHaveLength(2);
    const drillRow = all.find((r) => r.name === "Cordless drill")!;
    expect(drillRow).toMatchObject({ available: false, isMine: false, ownerName: "Alice", ownerTrusted: false });
    expect(JSON.stringify(all)).not.toContain("@example.com");

    const camping = await bob.as.query(api.tools.listCatalog, { today: TODAY, category: "camping" });
    expect(camping.map((r) => [r.name, r.isMine, r.available])).toEqual([["Tent", true, true]]);
  });

  test("requires sign-in", async () => {
    const { t } = await setup();
    await expect(t.query(api.tools.listCatalog, { today: TODAY })).rejects.toThrow("Not signed in");
  });
});
