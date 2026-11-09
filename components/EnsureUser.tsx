"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Signed-in pages render only after users.store has created/refreshed the user row.
 * Without this, a first-time user's queries would hit "User not registered".
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

  if (failed) return <p className="py-10 text-late">We couldn&apos;t load your account. Refresh the page.</p>;
  if (isLoading || !isAuthenticated || !ready) return <p className="py-10 text-ink-soft">Loading…</p>;
  return <>{children}</>;
}
