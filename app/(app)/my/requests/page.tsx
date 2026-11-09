"use client";

import { useMutation, useQuery } from "convex/react";
import { LoanList } from "@/components/LoanList";
import { PageTitle } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { useToday } from "@/lib/useToday";

export default function MyRequestsPage() {
  const today = useToday();
  const loans = useQuery(api.loans.myRequests, today ? { today } : "skip");
  const cancel = useMutation(api.loans.cancel);

  return (
    <>
      <PageTitle hint="Tools you asked to borrow. You'll get an email when the owner answers.">My requests</PageTitle>
      <LoanList
        loans={loans}
        empty="You haven't requested anything yet. Find a tool in the Catalog."
        counterpartLabel="Owner"
        actions={[
          {
            label: "Cancel request",
            variant: "danger",
            when: (l) => l.status === "requested",
            run: (loanId) => cancel({ loanId }),
            confirm: "Cancel this request?",
          },
        ]}
      />
    </>
  );
}
