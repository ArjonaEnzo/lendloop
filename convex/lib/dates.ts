// Loan dates are calendar days stored as "YYYY-MM-DD" strings, always read in UTC.
// Strings in this format sort the same way as the dates they represent,
// so plain string comparison (<, >) is a correct date comparison.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's UTC calendar day for a given timestamp (ms). */
export function todayUtc(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** True only for real dates written exactly as YYYY-MM-DD. */
export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const parsed = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
}

/** A loan is overdue starting the day AFTER its end date. */
export function isOverdue(endDate: string, today: string): boolean {
  return endDate < today;
}

/** Inclusive overlap: two ranges that share at least one day overlap. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toMs - fromMs) / DAY_MS);
}
