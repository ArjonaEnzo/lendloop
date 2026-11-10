"use client";

import { useState, type ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage, rangeDays, shortDate } from "@/lib/ui";
import { ActivityLine } from "./ActivityLine";
import { Avatar, Button, ErrorText, ListState, LoanProgress, StatusStamp } from "./ui";

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
        <ul className="space-y-4">
          {rows.map((loan) => {
            const days = rangeDays(loan.startDate, loan.endDate);
            const available = actions.filter((a) => a.when(loan));
            return (
              <li
                key={loan._id}
                className={`rounded-md border-2 bg-paper p-4 ${loan.overdue ? "border-late" : "border-ink"}`}
              >
                <article aria-label={`${loan.toolName}, ${shortDate(loan.startDate)} to ${shortDate(loan.endDate)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl leading-tight font-bold [font-stretch:85%] [overflow-wrap:anywhere]">
                      {loan.toolName}
                    </h2>
                    <StatusStamp status={loan.status} overdue={loan.overdue} />
                  </div>

                  <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <div>
                      <dt className="text-xs text-ink-soft">Out</dt>
                      <dd className="font-mono">{shortDate(loan.startDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-soft">Due back</dt>
                      <dd className={`font-mono ${loan.overdue ? "font-bold text-late" : ""}`}>{shortDate(loan.endDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-soft">Length</dt>
                      <dd className="font-mono">
                        {days} {days === 1 ? "day" : "days"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-soft">{counterpartLabel}</dt>
                      <dd className="flex items-center gap-1.5">
                        <Avatar name={loan.counterpartName} />
                        {loan.counterpartName}
                      </dd>
                    </div>
                    {extra ? extra(loan) : null}
                  </dl>

                  <LoanProgress status={loan.status} overdue={loan.overdue} />
                  <ActivityLine activity={loan.lastActivity} />

                  {available.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2 *:flex-1 sm:*:flex-none">
                      {available.map((a) => (
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
                  ) : null}
                  {error?.id === loan._id ? <ErrorText>{error.message}</ErrorText> : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </ListState>
  );
}
