/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const alice = {
  subject: "user_alice",
  tokenIdentifier: "https://clerk.test|user_alice",
  email: "alice@example.com",
  emailVerified: true,
  name: "Alice",
};

beforeEach(() => {
  process.env.ADMIN_EMAILS = "boss@example.com";
});
afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

describe("users.store", () => {
  test("creates a regular user", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(alice).mutation(api.users.store, {});
    const me = await t.withIdentity(alice).query(api.users.me, {});
    expect(me).toEqual({ name: "Alice", role: "user", trustedLender: false });
  });

  test("grants admin when the email is verified and listed in ADMIN_EMAILS", async () => {
    const t = convexTest(schema, modules);
    const boss = { ...alice, tokenIdentifier: "https://clerk.test|boss", email: "boss@example.com" };
    await t.withIdentity(boss).mutation(api.users.store, {});
    const me = await t.withIdentity(boss).query(api.users.me, {});
    expect(me?.role).toBe("admin");
  });

  test("does NOT grant admin when the listed email is not verified", async () => {
    const t = convexTest(schema, modules);
    const fakeBoss = {
      ...alice,
      tokenIdentifier: "https://clerk.test|fake",
      email: "boss@example.com",
      emailVerified: false,
    };
    await t.withIdentity(fakeBoss).mutation(api.users.store, {});
    const me = await t.withIdentity(fakeBoss).query(api.users.me, {});
    expect(me?.role).toBe("user");
  });

  test("is idempotent: storing twice keeps one row with the same id", async () => {
    const t = convexTest(schema, modules);
    const first = await t.withIdentity(alice).mutation(api.users.store, {});
    const second = await t.withIdentity(alice).mutation(api.users.store, {});
    expect(second).toBe(first);
    const count = await t.run(async (ctx) => (await ctx.db.query("users").take(10)).length);
    expect(count).toBe(1);
  });

  test("demotes an admin whose email was removed from ADMIN_EMAILS", async () => {
    const t = convexTest(schema, modules);
    const boss = { ...alice, tokenIdentifier: "https://clerk.test|boss", email: "boss@example.com" };
    await t.withIdentity(boss).mutation(api.users.store, {});
    process.env.ADMIN_EMAILS = "";
    await t.withIdentity(boss).mutation(api.users.store, {});
    const me = await t.withIdentity(boss).query(api.users.me, {});
    expect(me?.role).toBe("user");
  });

  test("throws when not signed in", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.store, {})).rejects.toThrow("Not signed in");
  });
});

describe("users.me", () => {
  test("returns null for a signed-in identity that was never stored", async () => {
    const t = convexTest(schema, modules);
    expect(await t.withIdentity(alice).query(api.users.me, {})).toBeNull();
  });

  test("never exposes the email to the browser", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(alice).mutation(api.users.store, {});
    const me = await t.withIdentity(alice).query(api.users.me, {});
    expect(me).not.toHaveProperty("email");
  });
});
