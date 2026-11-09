"use client";

import { SignInButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Gate for the signed-in area.
 * - Signed out: show a sign-in prompt (the data is protected by Convex anyway).
 * - Signed in: render only after users.store created/refreshed the user row,
 *   so a first-time user's queries never hit "User not registered".
 */
export function EnsureUser({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    store({})
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, store]);

  if (isLoading) return <p className="py-10 text-ink-soft">Loading…</p>;
  if (!isAuthenticated) {
    return (
      <div className="py-12">
        <p className="mb-4 text-lg">Sign in to lend or borrow tools.</p>
        <SignInButton mode="modal">
          <button className="rounded bg-signal px-5 py-3 font-bold text-ink shadow-[3px_3px_0_var(--color-ink)]">
            Sign in
          </button>
        </SignInButton>
      </div>
    );
  }
  if (failed) return <p className="py-10 text-late">We couldn&apos;t load your account. Refresh the page.</p>;
  if (!ready) return <p className="py-10 text-ink-soft">Loading…</p>;
  return <>{children}</>;
}
