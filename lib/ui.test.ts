import { describe, expect, test } from "vitest";
import { addDays, categoryCode, rangeDays, weekendRange } from "./ui";

describe("addDays", () => {
  test("crosses month and year boundaries in UTC", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-09", 6)).toBe("2026-11-15");
  });
});

describe("rangeDays", () => {
  test("counts both ends of the loan", () => {
    expect(rangeDays("2026-11-12", "2026-11-12")).toBe(1);
    expect(rangeDays("2026-11-12", "2026-11-14")).toBe(3);
    expect(rangeDays("2026-11-30", "2026-12-02")).toBe(3);
  });

  test("returns 0 for a reversed range", () => {
    expect(rangeDays("2026-11-14", "2026-11-12")).toBe(0);
  });
});

describe("weekendRange", () => {
  test("weekday picks the coming Saturday and Sunday", () => {
    expect(weekendRange("2026-11-09")).toEqual(["2026-11-14", "2026-11-15"]); // Monday
    expect(weekendRange("2026-11-13")).toEqual(["2026-11-14", "2026-11-15"]); // Friday
  });

  test("on the weekend it never starts in the past", () => {
    expect(weekendRange("2026-11-14")).toEqual(["2026-11-14", "2026-11-15"]); // Saturday
    expect(weekendRange("2026-11-15")).toEqual(["2026-11-15", "2026-11-15"]); // Sunday
  });
});

describe("categoryCode", () => {
  test("maps every category to a three-letter bin code", () => {
    expect(categoryCode("power_tools")).toBe("PWR");
    expect(categoryCode("cleaning")).toBe("CLN");
    expect(categoryCode("unknown")).toBe("OTH");
  });
});
