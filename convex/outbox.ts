import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { signedHeaders } from "./lib/hmac";

// Delivery of outbox rows to n8n (Convex -> n8n).
// One attempt per scheduled run. On failure: retry after 1, 5, 30 min; after 4 attempts -> failed.
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const FETCH_TIMEOUT_MS = 10_000;

export const get = internalQuery({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => await ctx.db.get("outbox", outboxId),
});

export const deliver = internalAction({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const row: Doc<"outbox"> | null = await ctx.runQuery(internal.outbox.get, { outboxId });
    if (!row || row.status !== "pending") return null; // already sent/failed: nothing to do

    // Missing configuration is not a transient error: fail now so it shows in /admin.
    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.LENDLOOP_TO_N8N_SECRET;
    if (!url || !secret) {
      const error = !url ? "N8N_WEBHOOK_URL not set" : "LENDLOOP_TO_N8N_SECRET not set";
      await ctx.runMutation(internal.outbox.markResult, { outboxId, ok: false, error, fatal: true });
      return null;
    }

    const body = JSON.stringify(row.payload);
    let error: string | undefined;
    try {
      const headers = await signedHeaders(
        secret,
        "POST",
        new URL(url).pathname,
        body,
        Math.floor(Date.now() / 1000),
      );
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    await ctx.runMutation(internal.outbox.markResult, {
      outboxId,
      ok: error === undefined,
      error: error?.slice(0, 500),
    });
    return null;
  },
});

export const markResult = internalMutation({
  args: {
    outboxId: v.id("outbox"),
    ok: v.boolean(),
    error: v.optional(v.string()),
    fatal: v.optional(v.boolean()),
  },
  handler: async (ctx, { outboxId, ok, error, fatal }) => {
    const row = await ctx.db.get("outbox", outboxId);
    if (!row || row.status !== "pending") return null;
    const attempts = row.attempts + 1;

    if (ok) {
      await ctx.db.patch("outbox", outboxId, {
        status: "sent",
        attempts,
        lastError: undefined,
        nextAttemptAt: undefined,
      });
      return null;
    }

    if (fatal || attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch("outbox", outboxId, {
        status: "failed",
        attempts,
        lastError: error,
        nextAttemptAt: undefined,
      });
      return null;
    }

    const delay = RETRY_DELAYS_MS[attempts - 1];
    await ctx.db.patch("outbox", outboxId, {
      attempts,
      lastError: error,
      nextAttemptAt: Date.now() + delay,
    });
    await ctx.scheduler.runAfter(delay, internal.outbox.deliver, { outboxId });
    return null;
  },
});
