// Payloads sent to n8n. Data minimization: only what the notification needs.
// No descriptions, no other user's contact data, no internal ids beyond eventId/loanId.

export type LoanStatus = "requested" | "approved" | "declined" | "cancelled" | "returned";

export type LoanEventPayload = {
  eventId: string;
  loanId: string;
  event: `loan.${LoanStatus}`;
  recipient: { email: string; name: string };
  toolName: string;
  startDate: string;
  endDate: string;
};

/** Deterministic id for one state change of one loan. Used as the dedupe key end to end. */
export function eventIdFor(loanId: string, status: LoanStatus, updatedAt: number): string {
  return `loan:${loanId}:${status}:${updatedAt}`;
}

/** Who should hear about this status: the owner for new/cancelled requests, the borrower otherwise. */
export function recipientRoleFor(status: LoanStatus): "owner" | "borrower" {
  return status === "requested" || status === "cancelled" ? "owner" : "borrower";
}

export function buildLoanEventPayload(input: {
  eventId: string;
  loanId: string;
  status: LoanStatus;
  toolName: string;
  startDate: string;
  endDate: string;
  recipient: { email: string; name: string };
}): LoanEventPayload {
  return {
    eventId: input.eventId,
    loanId: input.loanId,
    event: `loan.${input.status}`,
    recipient: { email: input.recipient.email, name: input.recipient.name },
    toolName: input.toolName,
    startDate: input.startDate,
    endDate: input.endDate,
  };
}
