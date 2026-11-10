"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { LoanList } from "@/components/LoanList";
import { Avatar, Button, Empty, ErrorText, ListState, PageTitle, TrustedBadge } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { categoryCode, categoryLabel, errorMessage } from "@/lib/ui";
import { useToday } from "@/lib/useToday";

export default function AdminPage() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <p role="status" className="py-10 text-ink-soft">Loading…</p>;
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
  const [busy, setBusy] = useState(false);

  // One action at a time: every button is disabled while a mutation is running.
  async function run(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle hint="Moderate listings, mark Trusted Lenders and watch the automations.">Admin</PageTitle>
      <ErrorText>{error}</ErrorText>

      <dl className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Automation problems" value={failed && errors ? failed.length + errors.length : undefined} alert />
        <Stat label="Neighbors" value={users?.length} />
        <Stat label="Listings" value={tools?.length} />
        <Stat label="Open loans" value={loans?.filter((l) => l.status === "requested" || l.status === "approved").length} />
      </dl>

      <Section title="Automation problems">
        <p className="mb-3 text-sm text-ink-soft">
          Notifications that n8n never confirmed after all retries, and failed n8n runs. Nothing fails silently.
        </p>
        <ListState items={failed} empty={<p className="mb-2 text-sm text-ok">No failed deliveries.</p>}>
          {(rows) => (
            <ul className="mb-4 space-y-2">
              {rows.map((r) => (
                <li key={r._id} className="rounded border-2 border-late bg-paper p-3 text-sm [overflow-wrap:anywhere]">
                  <span className="font-bold text-late">Delivery failed</span> after {r.attempts} attempts:{" "}
                  {r.lastError}{" "}
                  <span className="block font-mono text-xs text-ink-soft">{r.eventId}</span>
                </li>
              ))}
            </ul>
          )}
        </ListState>
        <ListState items={errors} empty={<p className="text-sm text-ok">No failed workflow runs.</p>}>
          {(rows) => (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r._id} className="rounded border-2 border-late bg-paper p-3 text-sm [overflow-wrap:anywhere]">
                  <span className="font-bold text-late">{r.workflowName}</span>
                  {r.nodeName ? ` at "${r.nodeName}"` : ""}: {r.message}{" "}
                  <span className="block font-mono text-xs text-ink-soft">execution {r.executionId}</span>
                </li>
              ))}
            </ul>
          )}
        </ListState>
      </Section>

      <Section title="Neighbors">
        <ListState items={users} empty={<Empty title="No neighbors yet" />}>
          {(rows) => (
            <ul className="divide-y-2 divide-board-hole rounded-lg border-2 border-ink bg-paper">
              {rows.map((u) => (
                <li key={u._id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <Avatar name={u.name} /> {u.name}
                    {u.role === "admin" ? <span className="text-xs text-ink-soft">(admin)</span> : null}
                    {u.trustedLender ? <TrustedBadge /> : null}
                  </span>
                  <Button
                    disabled={busy}
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
        <ListState items={tools} empty={<Empty title="No listings yet" />}>
          {(rows) => (
            <ul className="divide-y-2 divide-board-hole rounded-lg border-2 border-ink bg-paper">
              {rows.map((t) => (
                <li key={t._id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span>
                    <span className="mr-2 rounded-sm border-2 border-ink px-1 font-mono text-xs font-bold">
                      {categoryCode(t.category)}
                    </span>
                    <span className="font-bold">{t.name}</span>{" "}
                    <span className="text-sm text-ink-soft">
                      {categoryLabel(t.category)}, by {t.ownerName}
                    </span>
                  </span>
                  <Button
                    variant="danger"
                    disabled={busy}
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
          empty={<Empty title="No loans yet" />}
          counterpartLabel="Borrower"
          extra={(loan) => {
            const owner = loans?.find((l) => l._id === loan._id)?.ownerName;
            return owner ? (
              <div>
                <dt className="text-xs text-ink-soft">Owner</dt>
                <dd className="flex items-center gap-1.5">
                  <Avatar name={owner} />
                  {owner}
                </dd>
              </div>
            ) : null;
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

function Stat({ label, value, alert }: { label: string; value: number | undefined; alert?: boolean }) {
  const hot = alert && (value ?? 0) > 0;
  return (
    <div className={`rounded-md border-2 bg-paper p-3 ${hot ? "border-late" : "border-ink"}`}>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={`font-display text-4xl font-extrabold [font-stretch:80%] ${hot ? "text-late" : ""}`}>
        {value ?? "–"}
      </dd>
    </div>
  );
}
