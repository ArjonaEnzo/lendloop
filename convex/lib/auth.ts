import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Authorization helpers. Every public function that needs a user calls one of these.
// The user is always derived from the verified JWT on the server, never from arguments.

type Ctx = QueryCtx | MutationCtx;
export type Role = "admin" | "user";

/** Admins are configured on the server (Convex env var ADMIN_EMAILS), never from the client. */
function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * The role is computed on EVERY request from the live token + server config.
 * Only a verified email can grant admin; otherwise anyone could sign up with the admin's address.
 * The `role` stored on the users row is a display cache, never used for authorization.
 */
export function roleFor(identity: UserIdentity): Role {
  const email = identity.email ?? "";
  return identity.emailVerified === true && email !== "" && isAdminEmail(email) ? "admin" : "user";
}

export async function getUserOrNull(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

/** Returns the stored user with `role` replaced by the live role. */
export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not signed in");
  const user = await getUserOrNull(ctx);
  if (!user) throw new ConvexError("User not registered");
  return { ...user, role: roleFor(identity) };
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new ConvexError("Admin only");
  return user;
}
