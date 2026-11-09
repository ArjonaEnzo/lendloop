import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { canonicalString, sign, signedHeaders, verify } from "./hmac";

const SECRET = "s3cret";
const TS = 1700000000;
const CANONICAL = "1700000000.POST./api/x.{}";

describe("canonicalString", () => {
  test("joins timestamp, uppercase method, path and raw body with dots", () => {
    expect(canonicalString({ timestamp: TS, method: "post", path: "/api/x", body: "{}" })).toBe(
      CANONICAL,
    );
  });
});

describe("sign", () => {
  test("matches node:crypto HMAC-SHA256 hex (what the n8n Code node computes)", async () => {
    const expected = createHmac("sha256", SECRET).update(CANONICAL).digest("hex");
    const actual = await sign(SECRET, CANONICAL);
    // Fixed vector for the README / n8n side.
    console.log(`HMAC vector: secret=${SECRET} canonical=${CANONICAL} hex=${actual}`);
    expect(actual).toBe(expected);
    expect(actual).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verify", () => {
  const base = { secret: SECRET, method: "POST", path: "/api/x", body: "{}", nowSec: TS };

  async function validSignature(body = "{}") {
    return await sign(SECRET, canonicalString({ timestamp: TS, method: "POST", path: "/api/x", body }));
  }

  test("accepts a valid signature", async () => {
    const r = await verify({ ...base, timestamp: String(TS), signature: await validSignature() });
    expect(r).toEqual({ ok: true });
  });

  test("rejects a body that differs by one space (raw body, never re-serialized)", async () => {
    const r = await verify({
      ...base,
      body: "{ }",
      timestamp: String(TS),
      signature: await validSignature("{}"),
    });
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  test("rejects a signature made with another secret", async () => {
    const other = await sign("other", CANONICAL);
    const r = await verify({ ...base, timestamp: String(TS), signature: other });
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  test("rejects a timestamp 301 s in the past", async () => {
    const r = await verify({
      ...base,
      nowSec: TS + 301,
      timestamp: String(TS),
      signature: await validSignature(),
    });
    expect(r).toEqual({ ok: false, reason: "stale" });
  });

  test("rejects a timestamp 301 s in the future", async () => {
    const r = await verify({
      ...base,
      nowSec: TS - 301,
      timestamp: String(TS),
      signature: await validSignature(),
    });
    expect(r).toEqual({ ok: false, reason: "stale" });
  });

  test("accepts a timestamp exactly 300 s old", async () => {
    const r = await verify({
      ...base,
      nowSec: TS + 300,
      timestamp: String(TS),
      signature: await validSignature(),
    });
    expect(r).toEqual({ ok: true });
  });

  test("rejects missing headers", async () => {
    expect(await verify({ ...base, timestamp: null, signature: "ab" })).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(await verify({ ...base, timestamp: String(TS), signature: null })).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  test("rejects a non-numeric timestamp as stale", async () => {
    const r = await verify({ ...base, timestamp: "abc", signature: await validSignature() });
    expect(r).toEqual({ ok: false, reason: "stale" });
  });

  test("rejects non-hex or short signatures without throwing", async () => {
    for (const signature of ["zz", "abc", "g".repeat(64), ""]) {
      const r = await verify({ ...base, timestamp: String(TS), signature });
      expect(r).toEqual({ ok: false, reason: signature === "" ? "missing" : "bad_signature" });
    }
  });
});

describe("signedHeaders", () => {
  test("produces headers that verify", async () => {
    const h = await signedHeaders(SECRET, "POST", "/api/x", "{}", TS);
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["X-LendLoop-Timestamp"]).toBe(String(TS));
    const r = await verify({
      secret: SECRET,
      method: "POST",
      path: "/api/x",
      body: "{}",
      nowSec: TS,
      timestamp: h["X-LendLoop-Timestamp"],
      signature: h["X-LendLoop-Signature"],
    });
    expect(r).toEqual({ ok: true });
  });
});
