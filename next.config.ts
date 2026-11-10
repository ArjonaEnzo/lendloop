import type { NextConfig } from "next";
import { securityHeaders } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Every signed-in page waits for Clerk + users.store (EnsureUser) and loads its data in the
    // browser through Convex, so none of them can render instantly on navigation. Only validate
    // segments that opt in with `export const instant`, instead of flagging every page as
    // "dropped from rendering" in the dev overlay.
    instantInsights: { validationLevel: "manual-warning" },
  },
  async headers() {
    const headers = securityHeaders({
      clerkKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
      dev: process.env.NODE_ENV !== "production",
    });
    return [{ source: "/:path*", headers }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
