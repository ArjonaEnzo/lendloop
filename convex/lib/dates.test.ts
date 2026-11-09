import { describe, expect, test } from "vitest";
import { daysBetween, isOverdue, isValidDate, rangesOverlap, todayUtc } from "./dates";

describe("todayUtc", () => {
  test("uses the UTC calendar day, not local time", () => {
    expect(todayUtc(Date.UTC(2026, 10, 8, 23, 59))).toBe("2026-11-08");
    expect(todayUtc(Date.UTC(2026, 10, 9, 0, 0))).toBe("2026-11-09");
  });
});

describe("isOverdue", () => {
  test("a loan ending today is not overdue yet", () => {
    expect(isOverdue("2026-11-08", "2026-11-08")).toBe(false);
  });
  test("a loan that ended yesterday is overdue", () => {
    expect(isOverdue("2026-11-07", "2026-11-08")).toBe(true);
  });
});

describe("rangesOverlap (inclusive)", () => {
  test("sharing a single day counts as overlap", () => {
    expect(rangesOverlap("2026-11-01", "2026-11-05", "2026-11-05", "2026-11-09")).toBe(true);
  });
  test("back-to-back ranges do not overlap", () => {
    expect(rangesOverlap("2026-11-01", "2026-11-04", "2026-11-05", "2026-11-09")).toBe(false);
  });
  test("a range inside another overlaps", () => {
    expect(rangesOverlap("2026-11-01", "2026-11-30", "2026-11-10", "2026-11-12")).toBe(true);
  });
});

describe("daysBetween", () => {
  test("counts whole days", () => {
    expect(daysBetween("2026-11-06", "2026-11-08")).toBe(2);
    expect(daysBetween("2026-11-08", "2026-11-08")).toBe(0);
  });
});

describe("isValidDate", () => {
  test("accepts real YYYY-MM-DD dates", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
  });
  test("rejects impossible dates and other formats", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-2-3")).toBe(false);
    expect(isValidDate("08/11/2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });
});
