import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isValidDate } from "./lib/dates";
import { enqueueLoanEvent } from "./lib/outbox";
import { categoryV, conditionV } from "./schema";

const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;
const MAX_TOOLS_PER_USER = 50;
const LIST_LIMIT = 200;

const toolFieldsV = {
  name: v.string(),
  category: categoryV,
  condition: conditionV,
  description: v.string(),
};

function cleanToolInput(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) throw new ConvexError("Name is required");
  if (name.length > MAX_NAME) throw new ConvexError("Name is too long");
  if (description.length > MAX_DESCRIPTION) throw new ConvexError("Description is too long");
  return { name, description };
}

function assertDate(today: string) {
  if (!isValidDate(today)) throw new ConvexError("Invalid date");
}

/** True when an approved loan covers `today`. */
async function isLentOn(ctx: QueryCtx, toolId: Id<"tools">, today: string): Promise<boolean> {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .take(LIST_LIMIT);
  return approved.some((loan) => loan.startDate <= today && today <= loan.endDate);
}

/** Loads a live (not deleted) tool or throws. */
export async function getLiveTool(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"tools">> {
  const tool = await ctx.db.get("tools", toolId);
  if (!tool || tool.deletedAt !== undefined) throw new ConvexError("Tool not found");
  return tool;
}

// ---------- Public (no sign-in) ----------

/** Public landing page list. Only name + category: no owner data, no ids, no descriptions. */
export const listPublic = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    assertDate(today);
    const tools = await ctx.db.query("tools").order("desc").take(LIST_LIMIT);
    const rows: { name: string; category: Doc<"tools">["category"] }[] = [];
    for (const tool of tools) {
      if (tool.deletedAt !== undefined) continue;
      if (await isLentOn(ctx, tool._id, today)) continue;
      rows.push({ name: tool.name, category: tool.category });
    }
    return rows;
  },
});

// ---------- Signed-in views ----------

async function toCatalogRow(ctx: QueryCtx, tool: Doc<"tools">, me: Doc<"users">, today: string) {
  const owner = await ctx.db.get("users", tool.ownerId);
  return {
    _id: tool._id,
    name: tool.name,
    category: tool.category,
    condition: tool.condition,
    description: tool.description,
    available: !(await isLentOn(ctx, tool._id, today)),
    ownerName: owner?.name ?? "Unknown",
    ownerTrusted: owner?.trustedLender ?? false,
    isMine: tool.ownerId === me._id,
  };
}

export const listCatalog = query({
  args: { today: v.string(), category: v.optional(categoryV) },
  handler: async (ctx, { today, category }) => {
    const me = await requireUser(ctx);
    assertDate(today);
    const tools = category
      ? await ctx.db
          .query("tools")
          .withIndex("by_category", (q) => q.eq("category", category))
          .order("desc")
          .take(LIST_LIMIT)
      : await ctx.db.query("tools").order("desc").take(LIST_LIMIT);
    const live = tools.filter((t) => t.deletedAt === undefined);
    return await Promise.all(live.map((tool) => toCatalogRow(ctx, tool, me, today)));
  },
});

export const myListings = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const me = await requireUser(ctx);
    assertDate(today);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", me._id))
      .order("desc")
      .take(LIST_LIMIT);
    const live = tools.filter((t) => t.deletedAt === undefined);
    return await Promise.all(live.map((tool) => toCatalogRow(ctx, tool, me, today)));
  },
});

// ---------- Writes ----------

export const create = mutation({
  args: toolFieldsV,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const { name, description } = cleanToolInput(args);
    const owned = await ctx.db
      .query("tools")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", me._id))
      .take(MAX_TOOLS_PER_USER + 1);
    if (owned.filter((t) => t.deletedAt === undefined).length >= MAX_TOOLS_PER_USER) {
      throw new ConvexError("Listing limit reached");
    }
    return await ctx.db.insert("tools", {
      ownerId: me._id,
      name,
      description,
      category: args.category,
      condition: args.condition,
    });
  },
});

/** Only the owner may edit. Admins moderate by removing, not by rewriting other people's listings. */
export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFieldsV },
  handler: async (ctx, { toolId, ...fields }) => {
    const me = await requireUser(ctx);
    const tool = await getLiveTool(ctx, toolId);
    if (tool.ownerId !== me._id) throw new ConvexError("Not your tool");
    const { name, description } = cleanToolInput(fields);
    await ctx.db.patch("tools", toolId, {
      name,
      description,
      category: fields.category,
      condition: fields.condition,
    });
    return null;
  },
});

/**
 * Soft delete. Owner, or admin (moderation).
 * - Owner is blocked while an approved loan is not yet returned.
 * - Pending requests for the tool are auto-declined, so their borrowers get notified.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const me = await requireUser(ctx);
    const tool = await getLiveTool(ctx, toolId);
    const isOwner = tool.ownerId === me._id;
    if (!isOwner && me.role !== "admin") throw new ConvexError("Not your tool");

    if (isOwner && me.role !== "admin") {
      const active = await ctx.db
        .query("loans")
        .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
        .first();
      if (active) throw new ConvexError("Tool is currently lent out");
    }

    await declinePendingRequests(ctx, toolId);
    await ctx.db.patch("tools", toolId, { deletedAt: Date.now() });
    return null;
  },
});

async function declinePendingRequests(ctx: MutationCtx, toolId: Id<"tools">) {
  const pending = await ctx.db
    .query("loans")
    .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", "requested"))
    .take(LIST_LIMIT);
  const now = Date.now();
  for (const loan of pending) {
    await ctx.db.patch("loans", loan._id, { status: "declined", updatedAt: now });
    await enqueueLoanEvent(ctx, { ...loan, status: "declined", updatedAt: now });
  }
}
