import { describe, expect, test } from "vitest";
import { buildLoanEventPayload, eventIdFor, recipientRoleFor } from "./payloads";

describe("buildLoanEventPayload (data minimization)", () => {
  const payload = buildLoanEventPayload({
    eventId: "loan:abc:approved:1",
    loanId: "abc",
    status: "approved",
    toolName: "Drill",
    startDate: "2026-11-10",
    endDate: "2026-11-12",
    recipient: { email: "bob@example.com", name: "Bob" },
  });

  test("has exactly the fields n8n needs, nothing else", () => {
    expect(Object.keys(payload).sort()).toEqual([
      "endDate",
      "event",
      "eventId",
      "loanId",
      "recipient",
      "startDate",
      "toolName",
    ]);
    expect(Object.keys(payload.recipient).sort()).toEqual(["email", "name"]);
  });

  test("maps the status to a namespaced event name", () => {
    expect(payload.event).toBe("loan.approved");
  });
});

describe("recipientRoleFor", () => {
  test("owner hears about new and cancelled requests; borrower hears the rest", () => {
    expect(recipientRoleFor("requested")).toBe("owner");
    expect(recipientRoleFor("cancelled")).toBe("owner");
    expect(recipientRoleFor("approved")).toBe("borrower");
    expect(recipientRoleFor("declined")).toBe("borrower");
    expect(recipientRoleFor("returned")).toBe("borrower");
  });
});

describe("eventIdFor", () => {
  test("is deterministic per loan, status and update time", () => {
    expect(eventIdFor("abc", "approved", 123)).toBe("loan:abc:approved:123");
  });
});
