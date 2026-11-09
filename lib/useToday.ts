"use client";

import { useSyncExternalStore } from "react";
import { todayUtc } from "./ui";

const noopSubscribe = () => () => {};

/**
 * Today's UTC day, computed in the browser only. During the server pre-render it is null,
 * so queries that need it are skipped until hydration (Next 16 forbids reading the clock while prerendering).
 */
export function useToday(): string | null {
  return useSyncExternalStore(noopSubscribe, todayUtc, () => null);
}
