// HTTP security headers for every page (wired in next.config.ts).
// The CSP allows only our own origin plus the two services the browser talks to:
// Clerk (sign-in) and Convex (data, over HTTPS and a WebSocket).

const CLERK_DEV_WILDCARD = "*.clerk.accounts.dev";
const CONVEX_WILDCARD = "*.convex.cloud";

/**
 * A Clerk publishable key is "pk_test_" or "pk_live_" + base64("<frontend API host>$").
 * Decoding it gives the exact host, so the CSP does not need a wildcard.
 */
export function clerkFrontendApiHost(publishableKey: string | undefined): string {
  const encoded = publishableKey?.match(/^pk_(?:test|live)_(.+)$/)?.[1];
  if (!encoded) return CLERK_DEV_WILDCARD;
  try {
    const host = atob(encoded).replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? host : CLERK_DEV_WILDCARD;
  } catch {
    return CLERK_DEV_WILDCARD;
  }
}

function convexHost(convexUrl: string | undefined): string {
  try {
    return convexUrl ? new URL(convexUrl).host : CONVEX_WILDCARD;
  } catch {
    return CONVEX_WILDCARD;
  }
}

type Options = { clerkKey: string | undefined; convexUrl: string | undefined; dev: boolean };

export function contentSecurityPolicy({ clerkKey, convexUrl, dev }: Options): string {
  const clerk = `https://${clerkFrontendApiHost(clerkKey)}`;
  const convex = convexHost(convexUrl);
  const turnstile = "https://challenges.cloudflare.com"; // Clerk's bot protection on sign-up

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline': Next.js App Router adds inline bootstrap scripts. A nonce-based
    // policy would remove it but forces every page to render dynamically (production plan).
    // 'unsafe-eval' only in dev: React's dev tooling needs it.
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), clerk, turnstile],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https://img.clerk.com"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", clerk, "https://clerk-telemetry.com", `https://${convex}`, `wss://${convex}`],
    "frame-src": ["'self'", turnstile],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(options: Options): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}
