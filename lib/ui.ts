import { ConvexError } from "convex/values";

/** Today's calendar day in UTC, the same rule the server uses. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const CATEGORIES = [
  { value: "power_tools", label: "Power tools", code: "PWR" },
  { value: "hand_tools", label: "Hand tools", code: "HND" },
  { value: "garden", label: "Garden", code: "GRD" },
  { value: "kitchen", label: "Kitchen", code: "KIT" },
  { value: "camping", label: "Camping", code: "CMP" },
  { value: "cleaning", label: "Cleaning", code: "CLN" },
  { value: "other", label: "Other", code: "OTH" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

export const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "worn", label: "Worn" },
] as const;

export type Condition = (typeof CONDITIONS)[number]["value"];

export function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** Three-letter bin code printed on the tool tag, like a workshop shelf label. */
export function categoryCode(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.code ?? "OTH";
}

export function conditionLabel(value: string): string {
  return CONDITIONS.find((c) => c.value === value)?.label ?? value;
}

/** Server rule violations arrive as ConvexError with a readable message; anything else is unexpected. */
export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return "Something went wrong. Try again.";
}

/** "Jan 5" style dates for loan ranges (dates are UTC calendar days). */
export function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const DAY_MS = 86_400_000;

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Calendar day `n` days after `day` (YYYY-MM-DD, UTC). */
export function addDays(day: string, n: number): string {
  return new Date(dayMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Days a loan covers, counting both the start and the end day. 0 if the range is reversed. */
export function rangeDays(start: string, end: string): number {
  const diff = Math.round((dayMs(end) - dayMs(start)) / DAY_MS);
  return diff < 0 ? 0 : diff + 1;
}

/** "This weekend" preset: the coming Saturday to Sunday, never starting before `today`. */
export function weekendRange(today: string): [string, string] {
  const weekday = new Date(dayMs(today)).getUTCDay(); // 0 Sunday, 6 Saturday
  if (weekday === 0) return [today, today];
  const saturday = addDays(today, 6 - weekday);
  return [saturday, addDays(saturday, 1)];
}
