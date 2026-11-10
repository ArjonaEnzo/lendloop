"use client";

import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RequestForm } from "@/components/RequestForm";
import { ToolTag } from "@/components/ToolTag";
import { Button, Empty, ListState, PageTitle } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES, type Category, categoryLabel } from "@/lib/ui";
import { useToday } from "@/lib/useToday";

export default function CatalogPage() {
  return (
    <Suspense fallback={null}>
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

      <div
        role="group"
        aria-label="Filter by category"
        className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
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
        skeleton="tags"
        empty={
          category ? (
            <Empty
              title={`No ${categoryLabel(category).toLowerCase()} on the board yet`}
              body="Try another category, or lend one of yours."
              action={{ href: "/my/listings", label: "List a tool" }}
            />
          ) : (
            <Empty
              title="The board is empty"
              body="Hang the first tool. Your neighbors will see it here."
              action={{ href: "/my/listings", label: "List a tool" }}
            />
          )
        }
      >
        {(rows) => (
          <ul className="grid items-start gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((tool) => (
              <li key={tool._id}>
                <ToolTag
                  name={tool.name}
                  category={tool.category}
                  condition={tool.condition}
                  description={tool.description}
                  available={tool.available}
                  owner={tool.isMine ? "you" : tool.ownerName}
                  mine={tool.isMine}
                  trusted={tool.ownerTrusted}
                >
                  {tool.isMine ? (
                    <p className="text-sm text-tag-soft">This is your tool.</p>
                  ) : requesting === tool._id ? (
                    <RequestForm
                      toolId={tool._id}
                      toolName={tool.name}
                      onSent={() => {
                        setRequesting(null);
                        setSent(tool._id);
                      }}
                      onCancel={() => setRequesting(null)}
                    />
                  ) : (
                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={() => {
                        setRequesting(tool._id);
                        setSent(null);
                      }}
                    >
                      Request to borrow
                    </Button>
                  )}
                  <p role="status" className="text-sm font-bold text-tag-ink empty:hidden">
                    {sent === tool._id ? "Request sent. Track it in My requests." : ""}
                  </p>
                </ToolTag>
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
      className={`min-h-9 shrink-0 rounded-full border-2 px-3 text-sm ${active ? "border-ink bg-ink text-paper" : "border-ink-soft bg-paper text-ink hover:border-ink"}`}
    >
      {children}
    </button>
  );
}
