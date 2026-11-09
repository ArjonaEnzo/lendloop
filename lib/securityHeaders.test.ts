import { describe, expect, test } from "vitest";
import { clerkFrontendApiHost, contentSecurityPolicy, securityHeaders } from "./securityHeaders";

// A Clerk publishable key is "pk_test_" + base64("<frontend api host>$"). Fake host, not a real key.
const fakeKey = "pk_test_" + btoa("example-app-12.clerk.accounts.dev$");
const convexUrl = "https://happy-otter-123.convex.cloud";

function directives(csp: string) {
  return Object.fromEntries(
    csp.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe("clerkFrontendApiHost", () => {
  test("decodes the host from the publishable key", () => {
    expect(clerkFrontendApiHost(fakeKey)).toBe("example-app-12.clerk.accounts.dev");
  });
  test("falls back to the Clerk dev wildcard when the key is missing or malformed", () => {
    expect(clerkFrontendApiHost(undefined)).toBe("*.clerk.accounts.dev");
    expect(clerkFrontendApiHost("not-a-key")).toBe("*.clerk.accounts.dev");
  });
});

describe("contentSecurityPolicy", () => {
  const prod = directives(contentSecurityPolicy({ clerkKey: fakeKey, convexUrl, dev: false }));

  test("allows only our Clerk and Convex origins for network calls", () => {
    expect(prod["connect-src"]).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://example-app-12.clerk.accounts.dev",
        "https://happy-otter-123.convex.cloud",
        "wss://happy-otter-123.convex.cloud",
      ]),
    );
    expect(prod["connect-src"].join(" ")).not.toContain("*.convex.cloud");
  });

  test("blocks framing, plugins and foreign form targets", () => {
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
    expect(prod["base-uri"]).toEqual(["'self'"]);
  });

  test("unsafe-eval only in development (React dev tooling needs it)", () => {
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
    const dev = directives(contentSecurityPolicy({ clerkKey: fakeKey, convexUrl, dev: true }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
  });

  test("falls back to the Convex cloud wildcard when the URL is missing", () => {
    const csp = directives(contentSecurityPolicy({ clerkKey: fakeKey, convexUrl: undefined, dev: false }));
    expect(csp["connect-src"]).toEqual(expect.arrayContaining(["https://*.convex.cloud", "wss://*.convex.cloud"]));
  });
});

describe("securityHeaders", () => {
  test("sends the standard hardening headers", () => {
    const headers = Object.fromEntries(
      securityHeaders({ clerkKey: fakeKey, convexUrl, dev: false }).map((h) => [h.key, h.value]),
    );
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
  });
});
