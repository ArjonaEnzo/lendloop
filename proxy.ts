import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk only keeps the session in sync here. We do NOT authorize by URL path:
// every Convex function checks the caller itself, and signed-in pages show a
// sign-in prompt when there is no session (see components/EnsureUser.tsx).
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
