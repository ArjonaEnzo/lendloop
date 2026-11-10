"use client";

import { SignInButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { buttonClass } from "./ui";

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

  if (isLoading) return <p role="status" className="py-10 text-ink-soft">Loading…</p>;
  if (!isAuthenticated) {
    return (
      <section className="mx-auto max-w-md py-16 text-center sm:py-24">
        <span aria-hidden className="mx-auto block h-5 w-5 rounded-full border-4 border-ink bg-signal" />
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight [font-stretch:80%]">
          Sign in to use the board
        </h1>
        <p className="mt-3 text-ink-soft">Borrow from your neighbors, or lend the tools you rarely use.</p>
        <SignInButton mode="modal">
          <button className={buttonClass("primary", "mt-8 min-h-12 w-full px-6 text-base sm:w-auto")}>Sign in</button>
        </SignInButton>
      </section>
    );
  }
  if (failed) return <p className="py-10 text-late">We couldn&apos;t load your account. Refresh the page.</p>;
  if (!ready) return <p role="status" className="py-10 text-ink-soft">Loading…</p>;
  return <>{children}</>;
}
