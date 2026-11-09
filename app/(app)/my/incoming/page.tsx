"use client";

import { useMutation, useQuery } from "convex/react";
import { LoanList } from "@/components/LoanList";
import { PageTitle } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { useToday } from "@/lib/useToday";

export default function IncomingRequestsPage() {
  const today = useToday();
  const loans = useQuery(api.loans.incoming, today ? { today } : "skip");
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);

  return (
    <>
      <PageTitle hint="Requests for your tools. Approving declines other requests for the same days.">
        Incoming requests
      </PageTitle>
      <LoanList
        loans={loans}
        empty="No requests for your tools yet."
        counterpartLabel="Borrower"
        actions={[
          {
            label: "Approve",
            variant: "primary",
            when: (l) => l.status === "requested",
            run: (loanId) => approve({ loanId }),
          },
          {
            label: "Decline",
            variant: "danger",
            when: (l) => l.status === "requested",
            run: (loanId) => decline({ loanId }),
          },
          {
            label: "Mark returned",
            when: (l) => l.status === "approved",
            run: (loanId) => markReturned({ loanId }),
            confirm: "Did you get the tool back?",
          },
        ]}
      />
    </>
  );
}
