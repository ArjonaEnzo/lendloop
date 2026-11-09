import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from "./lib/hmac";
import { todayUtc } from "./lib/dates";

// Signed endpoints called by n8n (n8n -> Convex). Every request must carry a valid
// HMAC signature made with N8N_TO_LENDLOOP_SECRET, see convex/lib/hmac.ts.
// Order of checks: size (cheap, before reading a huge body) -> signature -> body shape.

const MAX_BODY_BYTES = 16 * 1024;

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain" } });
const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

type Handler = (ctx: ActionCtx, body: string) => Promise<Response>;

/** Wraps a handler with the size limit and the HMAC check. Rejections give no detail. */
function signed(handler: Handler) {
  return httpAction(async (ctx, req) => {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return text("payload too large", 413);
    const body = await req.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return text("payload too large", 413);

    const secret = process.env.N8N_TO_LENDLOOP_SECRET;
    const check = secret
      ? await verify({
          secret,
          timestamp: req.headers.get(TIMESTAMP_HEADER),
          signature: req.headers.get(SIGNATURE_HEADER),
          method: req.method,
          path: new URL(req.url).pathname,
          body,
          nowSec: Math.floor(Date.now() / 1000),
        })
      : ({ ok: false, reason: "missing" } as const);
    if (!check.ok) {
      console.warn(`Rejected ${req.method} ${new URL(req.url).pathname}: ${check.reason}`);
      return text("unauthorized", 401);
    }
    return await handler(ctx, body);
  });
}

/** Parses JSON as unknown; returns null when it is not a plain object. */
function parseObject(body: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(body);
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const isStr = (x: unknown, max: number): x is string =>
  typeof x === "string" && x.length > 0 && x.length <= max;
const isOptStr = (x: unknown, max: number): x is string | undefined =>
  x === undefined || (typeof x === "string" && x.length <= max);

const http = httpRouter();

http.route({
  path: "/api/overdue-loans",
  method: "GET",
  handler: signed(async (ctx) => {
    const loans = await ctx.runQuery(internal.automation.overdue, { today: todayUtc(Date.now()) });
    return json({ loans }, 200);
  }),
});

http.route({
  path: "/api/automation-events",
  method: "POST",
  handler: signed(async (ctx, body) => {
    const d = parseObject(body);
    if (
      !d ||
      !isStr(d.idempotencyKey, 200) ||
      !isStr(d.loanId, 64) ||
      (d.kind !== "request_notification_sent" && d.kind !== "overdue_reminder_sent") ||
      !isOptStr(d.detail, 500)
    ) {
      return text("bad request", 400);
    }
    const { result } = await ctx.runMutation(internal.automation.record, {
      idempotencyKey: d.idempotencyKey,
      loanId: d.loanId,
      kind: d.kind,
      detail: d.detail,
    });
    if (result === "invalid") return text("bad request", 400);
    return result === "created" ? json({ duplicate: false }, 201) : json({ duplicate: true }, 200);
  }),
});

http.route({
  path: "/api/workflow-errors",
  method: "POST",
  handler: signed(async (ctx, body) => {
    const d = parseObject(body);
    if (
      !d ||
      !isStr(d.executionId, 64) ||
      !isStr(d.workflowName, 200) ||
      !isOptStr(d.nodeName, 200) ||
      !isStr(d.message, 2000)
    ) {
      return text("bad request", 400);
    }
    const { result } = await ctx.runMutation(internal.automation.recordError, {
      executionId: d.executionId,
      workflowName: d.workflowName,
      nodeName: d.nodeName,
      message: d.message,
    });
    return result === "created" ? json({ duplicate: false }, 201) : json({ duplicate: true }, 200);
  }),
});

export default http;
