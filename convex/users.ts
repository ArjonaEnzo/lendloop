import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserOrNull, roleFor } from "./lib/auth";

/**
 * Creates or refreshes the current user's row from their Clerk token.
 * The client calls this once after sign-in. The stored role is only a cache;
 * authorization always recomputes it (see lib/auth.ts roleFor).
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not signed in");

    const email = identity.email ?? "";
    const role = roleFor(identity);
    const name = identity.givenName ?? identity.name ?? "Neighbor";

    const existing = await getUserOrNull(ctx);
    if (existing) {
      await ctx.db.patch("users", existing._id, { email, name, role });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email,
      name,
      role,
      trustedLender: false,
    });
  },
});

/** The signed-in user's public profile, with the live role. Never includes the email. */
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      role: v.union(v.literal("admin"), v.literal("user")),
      trustedLender: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const user = await getUserOrNull(ctx);
    if (!identity || !user) return null;
    return { name: user.name, role: roleFor(identity), trustedLender: user.trustedLender };
  },
});
