"use client";

import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RequestForm } from "@/components/RequestForm";
import { Button, ListState, PageTitle } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES, type Category, categoryLabel, conditionLabel } from "@/lib/ui";
import { useToday } from "@/lib/useToday";

export default function CatalogPage() {
  return (
    <Suspense fallback={<p className="py-10 text-ink-soft">Loading…</p>}>
      <Catalog />
    </Suspense>
  );
}

function Catalog() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("category");
  const category = CATEGORIES.some((c) => c.value === raw) ? (raw as Category) : undefined;
  const today = useToday();
  const tools = useQuery(api.tools.listCatalog, today ? { today, category } : "skip");
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);
  const [sent, setSent] = useState<Id<"tools"> | null>(null);

  function pick(value: Category | undefined) {
    router.replace(value ? `/tools?category=${value}` : "/tools");
  }

  return (
    <>
      <PageTitle hint="Everything your neighbors are lending. Pick dates and the owner gets a notification.">
        Catalog
      </PageTitle>

      <div role="group" aria-label="Filter by category" className="mb-6 flex flex-wrap gap-2">
        <FilterChip active={!category} onClick={() => pick(undefined)}>
          All
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c.value} active={category === c.value} onClick={() => pick(c.value)}>
            {c.label}
          </FilterChip>
        ))}
      </div>

      <ListState
        items={tools}
        empty={category ? `No ${categoryLabel(category).toLowerCase()} tools yet.` : "No tools listed yet. Add yours in My listings."}
      >
        {(rows) => (
          <ul className="divide-y-2 divide-board-hole rounded-lg border-2 border-ink bg-paper">
            {rows.map((tool) => (
              <li key={tool._id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold [font-stretch:85%]">{tool.name}</p>
                    <p className="text-sm text-ink-soft">
                      {categoryLabel(tool.category)}, {conditionLabel(tool.condition).toLowerCase()} condition. Lent by{" "}
                      {tool.isMine ? "you" : tool.ownerName}
                      {tool.ownerTrusted ? (
                        <span className="ml-2 rounded bg-ink px-1.5 py-0.5 text-xs font-bold text-signal">
                          Trusted Lender
                        </span>
                      ) : null}
                    </p>
                    {tool.description ? <p className="mt-2 max-w-prose">{tool.description}</p> : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${tool.available ? "text-ok" : "text-late"}`}>
                      {tool.available ? "Available today" : "Lent out today"}
                    </span>
                    {!tool.isMine && requesting !== tool._id ? (
                      <Button variant="primary" onClick={() => { setRequesting(tool._id); setSent(null); }}>
                        Request to borrow
                      </Button>
                    ) : null}
                  </div>
                </div>
                {requesting === tool._id ? (
                  <RequestForm
                    toolId={tool._id}
                    onSent={() => {
                      setRequesting(null);
                      setSent(tool._id);
                    }}
                    onCancel={() => setRequesting(null)}
                  />
                ) : null}
                {sent === tool._id ? <p className="mt-2 text-sm text-ok">Request sent. Track it in My requests.</p> : null}
              </li>
            ))}
          </ul>
        )}
      </ListState>
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border-2 px-3 py-1 text-sm ${active ? "border-ink bg-ink text-paper" : "border-board-hole bg-paper text-ink"}`}
    >
      {children}
    </button>
  );
}
