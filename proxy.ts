import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Optimistic redirect for signed-out visitors. Real authorization happens in Convex functions.
const isSignedInArea = createRouteMatcher(["/tools(.*)", "/my(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isSignedInArea(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
