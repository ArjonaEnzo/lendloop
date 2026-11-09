import type { NextConfig } from "next";
import { securityHeaders } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
