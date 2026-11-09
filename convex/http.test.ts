/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { insertLoan, makeUser, NOW, sampleTool, TODAY } from "../test-utils/fixtures";
import { api } from "./_generated/api";
import { signedHeaders } from "./lib/hmac";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-secret-to-lendloop";
const NOW_SEC = Math.floor(NOW / 1000);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.N8N_TO_LENDLOOP_SECRET = SECRET;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.N8N_TO_LENDLOOP_SECRET;
});

type T = ReturnType<typeof convexTest>;

async function signedFetch(t: T, method: "GET" | "POST", path: string, body = "", secret = SECRET) {
  const headers = await signedHeaders(secret, method, path, body, NOW_SEC);
  return await t.fetch(path, { method, headers, body: method === "GET" ? undefined : body });
}

async function setup() {
  const t = convexTest(schema, modules);
  const owner = await makeUser(t, "owner");
  const bob = await makeUser(t, "bob");
  const toolId = await owner.as.mutation(api.tools.create, sampleTool);
  const base = { toolId, borrowerId: bob.userId, ownerId: owner.userId, startDate: "2026-11-01" };
  const overdue = await insertLoan(t, { ...base, endDate: "2026-11-05", status: "approved" });
  const dueToday = await insertLoan(t, { ...base, endDate: TODAY, status: "approved" });
  const returned = await insertLoan(t, { ...base, endDate: "2026-11-04", status: "returned" });
  const requested = await insertLoan(t, { ...base, endDate: "2026-11-03", status: "requested" });
  return { t, overdue, dueToday, returned, requested };
}

async function countRows(t: T) {
  return await t.run(async (ctx) => ({
    events: (await ctx.db.query("automationEvents").take(100)).length,
    errors: (await ctx.db.query("workflowErrors").take(100)).length,
  }));
}

type OverdueLoan = {
  loanId: string;
  borrower: { email: string; name: string };
  toolName: string;
  endDate: string;
  daysOverdue: number;
};

const ENDPOINTS = [
  ["GET", "/api/overdue-loans"],
  ["POST", "/api/automation-events"],
  ["POST", "/api/workflow-errors"],
] as const;

describe("signature check (all endpoints)", () => {
  for (const [method, path] of ENDPOINTS) {
    test(`${method} ${path}: unsigned, wrong secret and stale → 401, no writes`, async () => {
      const { t, overdue } = await setup();
      const body =
        method === "GET"
          ? ""
          : JSON.stringify({
              idempotencyKey: `reminder:${overdue}:${TODAY}`,
              loanId: overdue,
              kind: "overdue_reminder_sent",
              executionId: "1",
              workflowName: "x",
              message: "m",
            });
      const init = { method, body: method === "GET" ? undefined : body };

      const unsigned = await t.fetch(path, init);
      expect(unsigned.status).toBe(401);
      expect(await unsigned.text()).toBe("unauthorized");

      const wrong = await signedFetch(t, method, path, body, "not-the-secret");
      expect(wrong.status).toBe(401);

      const staleHeaders = await signedHeaders(SECRET, method, path, body, NOW_SEC - 301);
      const stale = await t.fetch(path, { ...init, headers: staleHeaders });
      expect(stale.status).toBe(401);

      expect(await countRows(t)).toEqual({ events: 0, errors: 0 });
    });
  }

  test("signature over a different body is rejected (no re-serialization)", async () => {
    const { t, overdue } = await setup();
    const signedBody = JSON.stringify({
      idempotencyKey: `reminder:${overdue}:${TODAY}`,
      loanId: overdue,
      kind: "overdue_reminder_sent",
    });
    const headers = await signedHeaders(SECRET, "POST", "/api/automation-events", signedBody, NOW_SEC);
    const res = await t.fetch("/api/automation-events", {
      method: "POST",
      headers,
      body: signedBody.replace(",", ", "),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/overdue-loans", () => {
  test("returns only approved loans past their end date, borrower data only", async () => {
    const { t, overdue } = await setup();
    const res = await signedFetch(t, "GET", "/api/overdue-loans");
    expect(res.status).toBe(200);
    const { loans } = (await res.json()) as { loans: OverdueLoan[] };
    expect(loans).toHaveLength(1);
    expect(loans[0]).toEqual({
      loanId: overdue,
      borrower: { email: "bob@example.com", name: "Bob" },
      toolName: sampleTool.name,
      endDate: "2026-11-05",
      daysOverdue: 3,
    });
    expect(Object.keys(loans[0]).sort()).toEqual(
      ["borrower", "daysOverdue", "endDate", "loanId", "toolName"].sort(),
    );
    expect(JSON.stringify(loans)).not.toContain("owner@example.com");
  });

  test("a loan reminded today is excluded on the next call", async () => {
    const { t, overdue } = await setup();
    const write = await signedFetch(
      t,
      "POST",
      "/api/automation-events",
      JSON.stringify({
        idempotencyKey: `reminder:${overdue}:${TODAY}`,
        loanId: overdue,
        kind: "overdue_reminder_sent",
      }),
    );
    expect(write.status).toBe(201);
    const res = await signedFetch(t, "GET", "/api/overdue-loans");
    const { loans } = (await res.json()) as { loans: OverdueLoan[] };
    expect(loans).toEqual([]);
  });
});

describe("POST /api/automation-events", () => {
  test("same key twice → 201 then 200 duplicate, one row", async () => {
    const { t, overdue } = await setup();
    const body = JSON.stringify({
      idempotencyKey: `reminder:${overdue}:${TODAY}`,
      loanId: overdue,
      kind: "overdue_reminder_sent",
      detail: "sent to bob",
    });
    const first = await signedFetch(t, "POST", "/api/automation-events", body);
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ duplicate: false });
    const second = await signedFetch(t, "POST", "/api/automation-events", body);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ duplicate: true });
    expect((await countRows(t)).events).toBe(1);
  });

  test("notify key for a request notification is stored", async () => {
    const { t, requested } = await setup();
    const res = await signedFetch(
      t,
      "POST",
      "/api/automation-events",
      JSON.stringify({
        idempotencyKey: `notify:loan:${requested}:requested:${NOW}`,
        loanId: requested,
        kind: "request_notification_sent",
      }),
    );
    expect(res.status).toBe(201);
    const rows = await t.run((ctx) => ctx.db.query("automationEvents").take(10));
    expect(rows[0]).toMatchObject({ loanId: requested, kind: "request_notification_sent" });
  });

  test("body over 16 KB → 413", async () => {
    const { t, overdue } = await setup();
    const body = JSON.stringify({
      idempotencyKey: `reminder:${overdue}:${TODAY}`,
      loanId: overdue,
      kind: "overdue_reminder_sent",
      detail: "x".repeat(17 * 1024),
    });
    const res = await signedFetch(t, "POST", "/api/automation-events", body);
    expect(res.status).toBe(413);
    expect((await countRows(t)).events).toBe(0);
  });

  test("bad bodies → 400", async () => {
    const { t, overdue } = await setup();
    const cases = [
      "not json",
      JSON.stringify({ kind: "other" }),
      JSON.stringify({ idempotencyKey: "k", loanId: overdue, kind: "other" }),
      JSON.stringify({ idempotencyKey: `reminder:${overdue}:${TODAY}`, loanId: "nope", kind: "overdue_reminder_sent" }),
      // key that does not belong to this loan / kind
      JSON.stringify({ idempotencyKey: `notify:loan:${overdue}:x`, loanId: overdue, kind: "overdue_reminder_sent" }),
      JSON.stringify({ idempotencyKey: `reminder:${overdue}:${TODAY}`, loanId: overdue, kind: "overdue_reminder_sent", detail: 5 }),
    ];
    for (const body of cases) {
      const res = await signedFetch(t, "POST", "/api/automation-events", body);
      expect(res.status, body).toBe(400);
    }
    expect((await countRows(t)).events).toBe(0);
  });
});

describe("POST /api/workflow-errors", () => {
  test("dedupes by executionId", async () => {
    const { t } = await setup();
    const body = JSON.stringify({
      executionId: "42",
      workflowName: "LendLoop — Request notification",
      nodeName: "Send Email",
      message: "connect ECONNREFUSED",
    });
    const first = await signedFetch(t, "POST", "/api/workflow-errors", body);
    expect(first.status).toBe(201);
    const second = await signedFetch(t, "POST", "/api/workflow-errors", body);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ duplicate: true });
    const rows = await t.run((ctx) => ctx.db.query("workflowErrors").take(10));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ idempotencyKey: "error:42", nodeName: "Send Email" });
  });

  test("missing message → 400", async () => {
    const { t } = await setup();
    const res = await signedFetch(
      t,
      "POST",
      "/api/workflow-errors",
      JSON.stringify({ executionId: "1", workflowName: "x" }),
    );
    expect(res.status).toBe(400);
  });
});
