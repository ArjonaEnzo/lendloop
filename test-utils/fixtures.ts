// Shared helpers for convex-test suites. Lives outside convex/ so it is never deployed.
import type { TestConvex } from "convex-test";
import type { Id } from "../convex/_generated/dataModel";
import type schema from "../convex/schema";

type T = TestConvex<typeof schema>;

export const TODAY = "2026-11-08";
export const NOW = Date.UTC(2026, 10, 8, 12, 0);

export function identity(key: string, email = `${key}@example.com`) {
  return {
    subject: `user_${key}`,
    tokenIdentifier: `https://clerk.test|${key}`,
    email,
    emailVerified: true,
    name: key[0].toUpperCase() + key.slice(1),
  };
}

/** Inserts a user row directly (as if users.store had run) and returns an identity-scoped client. */
export async function makeUser(
  t: T,
  key: string,
  opts: { admin?: boolean; email?: string } = {},
) {
  const id = identity(key, opts.email);
  const userId: Id<"users"> = await t.run((ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier: id.tokenIdentifier,
      email: id.email,
      name: id.name,
      role: opts.admin ? "admin" : "user",
      trustedLender: false,
    }),
  );
  return { userId, as: t.withIdentity(id), identity: id };
}

export const sampleTool = {
  name: "Cordless drill",
  category: "power_tools" as const,
  condition: "good" as const,
  description: "18V, two batteries included.",
};

export async function insertLoan(
  t: T,
  fields: {
    toolId: Id<"tools">;
    borrowerId: Id<"users">;
    ownerId: Id<"users">;
    startDate: string;
    endDate: string;
    status: "requested" | "approved" | "declined" | "cancelled" | "returned";
  },
): Promise<Id<"loans">> {
  return await t.run((ctx) => ctx.db.insert("loans", { ...fields, updatedAt: NOW }));
}
