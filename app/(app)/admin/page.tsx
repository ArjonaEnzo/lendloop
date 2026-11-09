"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { LoanList } from "@/components/LoanList";
import { Button, ErrorText, ListState, PageTitle } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { categoryLabel, errorMessage } from "@/lib/ui";
import { useToday } from "@/lib/useToday";

export default function AdminPage() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <p className="py-10 text-ink-soft">Loading…</p>;
  // Cosmetic gate only. The queries below would be refused by Convex anyway.
  if (me?.role !== "admin") {
    return (
      <PageTitle hint="This page is for LendLoop admins. Your account doesn't have admin access.">Admin only</PageTitle>
    );
  }
  return <AdminDashboard />;
}

function AdminDashboard() {
  const today = useToday();
  const loans = useQuery(api.admin.allLoans, today ? { today } : "skip");
  const users = useQuery(api.admin.users);
  const tools = useQuery(api.tools.listCatalog, today ? { today } : "skip");
  const failed = useQuery(api.admin.failedDeliveries);
  const errors = useQuery(api.admin.workflowErrors);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const removeTool = useMutation(api.tools.remove);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageTitle hint="Moderate listings, mark Trusted Lenders and watch the automations.">Admin</PageTitle>
      <ErrorText>{error}</ErrorText>

      <Section title="Automation problems">
        <p className="mb-3 text-sm text-ink-soft">
          Notifications that n8n never confirmed after all retries, and failed n8n runs. Nothing fails silently.
        </p>
        <ListState items={failed} empty="No failed deliveries.">
          {(rows) => (
            <ul className="mb-4 space-y-2">
              {rows.map((r) => (
                <li key={r._id} className="rounded border-2 border-late bg-paper p-3 text-sm">
                  <span className="font-bold text-late">Delivery failed</span> after {r.attempts} attempts:{" "}
                  {r.lastError} <span className="text-ink-soft">({r.eventId})</span>
                </li>
              ))}
            </ul>
          )}
        </ListState>
        <ListState items={errors} empty="No failed workflow runs.">
          {(rows) => (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r._id} className="rounded border-2 border-late bg-paper p-3 text-sm">
                  <span className="font-bold text-late">{r.workflowName}</span>
                  {r.nodeName ? ` at "${r.nodeName}"` : ""}: {r.message}{" "}
                  <span className="text-ink-soft">(execution {r.executionId})</span>
                </li>
              ))}
            </ul>
          )}
        </ListState>
      </Section>

      <Section title="Neighbors">
        <ListState items={users} empty="No users yet.">
          {(rows) => (
            <ul className="divide-y-2 divide-board-hole rounded-lg border-2 border-ink bg-paper">
              {rows.map((u) => (
                <li key={u._id} className="flex items-center justify-between gap-3 p-3">
                  <span>
                    {u.name} {u.role === "admin" ? <span className="text-xs text-ink-soft">(admin)</span> : null}
                    {u.trustedLender ? (
                      <span className="ml-2 rounded bg-ink px-1.5 py-0.5 text-xs font-bold text-signal">Trusted Lender</span>
                    ) : null}
                  </span>
                  <Button
                    onClick={() => run(() => setTrusted({ userId: u._id as Id<"users">, trusted: !u.trustedLender }))}
                  >
                    {u.trustedLender ? "Remove Trusted Lender" : "Mark Trusted Lender"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ListState>
      </Section>

      <Section title="All listings">
        <ListState items={tools} empty="No listings.">
          {(rows) => (
            <ul className="divide-y-2 divide-board-hole rounded-lg border-2 border-ink bg-paper">
              {rows.map((t) => (
                <li key={t._id} className="flex items-center justify-between gap-3 p-3">
                  <span>
                    <span className="font-bold">{t.name}</span>{" "}
                    <span className="text-sm text-ink-soft">
                      {categoryLabel(t.category)}, by {t.ownerName}
                    </span>
                  </span>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (window.confirm(`Remove "${t.name}" by ${t.ownerName}?`)) {
                        void run(() => removeTool({ toolId: t._id }));
                      }
                    }}
                  >
                    Remove listing
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ListState>
      </Section>

      <Section title="All loans">
        <LoanList
          loans={loans}
          empty="No loans yet."
          counterpartLabel="Borrower"
          extra={(loan) => {
            const owner = loans?.find((l) => l._id === loan._id)?.ownerName;
            return owner ? `. Owner: ${owner}` : null;
          }}
        />
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-2xl font-bold [font-stretch:85%]">{title}</h2>
      {children}
    </section>
  );
}
