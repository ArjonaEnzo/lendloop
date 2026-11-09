import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserOrNull } from "./lib/auth";

/** Admins are configured on the server (Convex env var), never from the client. */
function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * Creates or refreshes the current user's row from their Clerk token.
 * The client calls this once after sign-in. The role is recomputed every time,
 * so removing an email from ADMIN_EMAILS demotes that user on next sign-in.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not signed in");

    const email = identity.email ?? "";
    // Only a verified email can grant admin; otherwise anyone could sign up with the admin's address.
    const role = identity.emailVerified === true && email && isAdminEmail(email) ? "admin" : "user";
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

/** The signed-in user's public profile. Never includes the email. */
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
    const user = await getUserOrNull(ctx);
    if (!user) return null;
    return { name: user.name, role: user.role, trustedLender: user.trustedLender };
  },
});
