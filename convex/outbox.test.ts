/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { makeUser, NOW, sampleTool } from "../test-utils/fixtures";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { verify } from "./lib/hmac";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const WEBHOOK = "https://example.trycloudflare.com/webhook/lendloop-loan-events";
const SECRET = "test-secret-to-n8n";

type FetchArgs = [string, RequestInit];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.N8N_WEBHOOK_URL = WEBHOOK;
  process.env.LENDLOOP_TO_N8N_SECRET = SECRET;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.LENDLOOP_TO_N8N_SECRET;
});

/** Creates a loan request; the mutation enqueues one outbox row and schedules delivery. */
async function setup() {
  const t = convexTest(schema, modules);
  const owner = await makeUser(t, "owner");
  const bob = await makeUser(t, "bob");
  const toolId = await owner.as.mutation(api.tools.create, sampleTool);
  await bob.as.mutation(api.loans.request, {
    toolId,
    startDate: "2026-11-10",
    endDate: "2026-11-12",
  });
  return t;
}

async function onlyRow(t: ReturnType<typeof convexTest>): Promise<Doc<"outbox">> {
  const rows = await t.run((ctx) => ctx.db.query("outbox").take(10));
  expect(rows).toHaveLength(1);
  return rows[0];
}

/** Scheduled runs start a few ms after the timer fires; compare with a small tolerance. */
function expectNear(actual: number | undefined, expected: number) {
  expect(actual).toBeGreaterThanOrEqual(expected);
  expect(actual).toBeLessThan(expected + 1_000);
}

/** Runs the scheduled delivery that is due now. */
async function runDue(t: ReturnType<typeof convexTest>) {
  await t.finishInProgressScheduledFunctions();
}

describe("outbox delivery", () => {
  test("success: POSTs the signed payload to N8N_WEBHOOK_URL and marks the row sent", async () => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    const t = await setup();
    vi.runOnlyPendingTimers();
    await runDue(t);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
    const row = await onlyRow(t);
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(row.payload));

    const headers = init.headers as Record<string, string>;
    const check = await verify({
      secret: SECRET,
      timestamp: headers["X-LendLoop-Timestamp"],
      signature: headers["X-LendLoop-Signature"],
      method: "POST",
      path: "/webhook/lendloop-loan-events",
      body: init.body as string,
      nowSec: Math.floor(NOW / 1000),
    });
    expect(check).toEqual({ ok: true });

    expect(row.status).toBe("sent");
    expect(row.attempts).toBe(1);
  });

  test("uses a 10 s timeout on fetch", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    const t = await setup();
    vi.runOnlyPendingTimers();
    await runDue(t);
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("HTTP 500: retries after 1, 5 and 30 min, then fails after 4 attempts with lastError", async () => {
    fetchMock.mockImplementation(async () => new Response("boom", { status: 500 }));
    const t = await setup();
    vi.runOnlyPendingTimers();
    await runDue(t);

    let row = await onlyRow(t);
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expectNear(row.nextAttemptAt, NOW + 60_000);
    expect(row.lastError).toContain("HTTP 500");

    // Not retried before the backoff elapses.
    vi.advanceTimersByTime(59_000);
    await runDue(t);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    await runDue(t);
    row = await onlyRow(t);
    expect(row.attempts).toBe(2);
    expectNear(row.nextAttemptAt, NOW + 60_000 + 5 * 60_000);

    vi.advanceTimersByTime(5 * 60_000);
    await runDue(t);
    row = await onlyRow(t);
    expect(row.attempts).toBe(3);
    expect(row.status).toBe("pending");

    vi.advanceTimersByTime(30 * 60_000);
    await runDue(t);
    row = await onlyRow(t);
    expect(row.attempts).toBe(4);
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("HTTP 500");
    expect(row.nextAttemptAt).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Nothing else scheduled.
    vi.advanceTimersByTime(24 * 60 * 60_000);
    await runDue(t);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test("network error: same retry path, lastError has the message", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED"));
    const t = await setup();
    vi.runOnlyPendingTimers();
    await runDue(t);
    const row = await onlyRow(t);
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("ECONNREFUSED");
  });

  test("missing N8N_WEBHOOK_URL: fails immediately without fetching", async () => {
    delete process.env.N8N_WEBHOOK_URL;
    const t = await setup();
    vi.runOnlyPendingTimers();
    await runDue(t);
    const row = await onlyRow(t);
    expect(row.status).toBe("failed");
    expect(row.lastError).toBe("N8N_WEBHOOK_URL not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("missing LENDLOOP_TO_N8N_SECRET: fails immediately without fetching", async () => {
    delete process.env.LENDLOOP_TO_N8N_SECRET;
    const t = await setup();
    vi.runOnlyPendingTimers();
    await runDue(t);
    const row = await onlyRow(t);
    expect(row.status).toBe("failed");
    expect(row.lastError).toBe("LENDLOOP_TO_N8N_SECRET not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
