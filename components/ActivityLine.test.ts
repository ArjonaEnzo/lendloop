import { describe, expect, test } from "vitest";
import { relativeTime } from "./ActivityLine";

const NOW = Date.UTC(2026, 10, 9, 12, 0);

describe("relativeTime", () => {
  test("formats past events", () => {
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5 minutes ago");
    expect(relativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2 days ago");
  });

  // Found in the E2E run: the component refreshes `now` once a minute, so a write-back that
  // arrives after the last refresh (or a browser clock a bit behind the server) showed
  // "Notification sent in 13 seconds". An automation event is always in the past.
  test("never shows a past event in the future tense", () => {
    expect(relativeTime(NOW + 13_000, NOW)).toBe("now");
    expect(relativeTime(NOW + 5 * 60_000, NOW)).toBe("now");
  });
});
