"use client";

import { useState, type ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage, shortDate } from "@/lib/ui";
import { ActivityLine } from "./ActivityLine";
import { Button, ErrorText, ListState, StatusBadge } from "./ui";

export type LoanView = {
  _id: Id<"loans">;
  toolName: string;
  status: string;
  startDate: string;
  endDate: string;
  counterpartName: string;
  overdue: boolean;
  lastActivity: { kind: string; createdAt: number } | null;
};

export type LoanAction = {
  label: string;
  variant?: "primary" | "plain" | "danger";
  when: (loan: LoanView) => boolean;
  run: (loanId: Id<"loans">) => Promise<unknown>;
  confirm?: string;
};

/** One list for My requests, Incoming requests and Admin, so the three views read the same way. */
export function LoanList({
  loans,
  empty,
  counterpartLabel,
  actions = [],
  extra,
}: {
  loans: LoanView[] | undefined;
  empty: ReactNode;
  counterpartLabel: string;
  actions?: LoanAction[];
  extra?: (loan: LoanView) => ReactNode;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  async function act(loan: LoanView, action: LoanAction) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setError(null);
    setBusy(`${loan._id}:${action.label}`);
    try {
      await action.run(loan._id);
    } catch (err) {
      setError({ id: loan._id, message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ListState items={loans} empty={empty}>
      {(rows) => (
        <ul className="divide-y-2 divide-board-hole rounded-lg border-2 border-ink bg-paper">
          {rows.map((loan) => (
            <li key={loan._id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-xl font-bold [font-stretch:85%]">{loan.toolName}</p>
                    <StatusBadge status={loan.status} overdue={loan.overdue} />
                  </div>
                  <p className="text-sm text-ink-soft">
                    {shortDate(loan.startDate)} to {shortDate(loan.endDate)}. {counterpartLabel}:{" "}
                    {loan.counterpartName}
                    {extra ? extra(loan) : null}
                  </p>
                  <ActivityLine activity={loan.lastActivity} />
                </div>
                <div className="flex gap-2">
                  {actions
                    .filter((a) => a.when(loan))
                    .map((a) => (
                      <Button
                        key={a.label}
                        variant={a.variant}
                        disabled={busy !== null}
                        onClick={() => act(loan, a)}
                      >
                        {busy === `${loan._id}:${a.label}` ? "Working…" : a.label}
                      </Button>
                    ))}
                </div>
              </div>
              {error?.id === loan._id ? <ErrorText>{error.message}</ErrorText> : null}
            </li>
          ))}
        </ul>
      )}
    </ListState>
  );
}
