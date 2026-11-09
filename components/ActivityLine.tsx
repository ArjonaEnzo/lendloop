"use client";

import { useEffect, useState } from "react";

const KIND_LABEL: Record<string, string> = {
  request_notification_sent: "Notification sent",
  overdue_reminder_sent: "Reminder sent",
};

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 days ago", "5 minutes ago", "yesterday" */
export function relativeTime(fromMs: number, nowMs: number): string {
  // Events are always in the past. `now` refreshes once a minute and the browser clock can lag
  // the server, so a fresh event can look a few seconds "in the future": show it as "now".
  const seconds = Math.min(0, Math.round((fromMs - nowMs) / 1000));
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}

/** Latest automation activity from n8n for a loan, e.g. "Reminder sent 2 days ago". */
export function ActivityLine({ activity }: { activity: { kind: string; createdAt: number } | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!activity) return null;
  return (
    <p className="mt-1 text-xs text-ink-soft">
      {KIND_LABEL[activity.kind] ?? "Automation ran"} {relativeTime(activity.createdAt, now)}
    </p>
  );
}
