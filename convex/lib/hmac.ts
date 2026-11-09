// HMAC-SHA256 request signing shared by both directions (Convex <-> n8n).
// Web Crypto only, so it runs in the default Convex runtime (no "use node").
//
// Canonical string: `${timestamp}.${METHOD}.${path}.${rawBody}`
// - timestamp: unix seconds (header X-LendLoop-Timestamp)
// - METHOD: uppercase
// - path: URL pathname only (no host, no query)
// - rawBody: the exact text sent; "" for GET. Never re-serialize JSON before verifying.

export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const DEFAULT_TOLERANCE_SEC = 300;

export function canonicalString(p: {
  timestamp: number;
  method: string;
  path: string;
  body: string;
}): string {
  return `${p.timestamp}.${p.method.toUpperCase()}.${p.path}.${p.body}`;
}

/** Lowercase hex HMAC-SHA256 of `canonical` with `secret`. */
export async function sign(secret: string, canonical: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(canonical));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time that depends only on their length, not on where they differ. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "stale" | "bad_signature" };

export async function verify(p: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  method: string;
  path: string;
  body: string;
  nowSec: number;
  toleranceSec?: number;
}): Promise<VerifyResult> {
  if (!p.timestamp || !p.signature) return { ok: false, reason: "missing" };

  const tolerance = p.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  if (!/^\d+$/.test(p.timestamp)) return { ok: false, reason: "stale" };
  const ts = Number(p.timestamp);
  if (Math.abs(p.nowSec - ts) > tolerance) return { ok: false, reason: "stale" };

  const signature = p.signature.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: "bad_signature" };

  const expected = await sign(
    p.secret,
    canonicalString({ timestamp: ts, method: p.method, path: p.path, body: p.body }),
  );
  return constantTimeEqual(expected, signature) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

export async function signedHeaders(
  secret: string,
  method: string,
  path: string,
  body: string,
  nowSec: number,
): Promise<Record<"X-LendLoop-Timestamp" | "X-LendLoop-Signature" | "Content-Type", string>> {
  const signature = await sign(secret, canonicalString({ timestamp: nowSec, method, path, body }));
  return {
    "Content-Type": "application/json",
    [TIMESTAMP_HEADER]: String(nowSec),
    [SIGNATURE_HEADER]: signature,
  } as Record<"X-LendLoop-Timestamp" | "X-LendLoop-Signature" | "Content-Type", string>;
}
