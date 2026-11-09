"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ToolForm } from "@/components/ToolForm";
import { Button, ErrorText, ListState, PageTitle } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { categoryLabel, conditionLabel, errorMessage, todayUtc } from "@/lib/ui";

export default function MyListingsPage() {
  const [today] = useState(todayUtc);
  const tools = useQuery(api.tools.myListings, { today });
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  const [rowError, setRowError] = useState<{ id: Id<"tools">; message: string } | null>(null);

  async function handleRemove(toolId: Id<"tools">, name: string) {
    if (!window.confirm(`Remove "${name}"? Pending requests for it will be declined.`)) return;
    setRowError(null);
    try {
      await remove({ toolId });
    } catch (err) {
      setRowError({ id: toolId, message: errorMessage(err) });
    }
  }

  return (
    <>
      <PageTitle hint="Tools you lend. Neighbors see the name, category, condition and description.">
        My listings
      </PageTitle>

      <section className="mb-8 rounded-lg border-2 border-ink bg-paper p-4">
        <h2 className="mb-3 font-display text-xl font-bold [font-stretch:85%]">List a tool</h2>
        <ToolForm submitLabel="List tool" onSubmit={(fields) => create(fields)} />
      </section>

      <ListState items={tools} empty="You haven't listed anything yet. Use the form above.">
        {(rows) => (
          <ul className="divide-y-2 divide-board-hole rounded-lg border-2 border-ink bg-paper">
            {rows.map((tool) => (
              <li key={tool._id} className="p-4">
                {editing === tool._id ? (
                  <ToolForm
                    initial={{
                      name: tool.name,
                      category: tool.category,
                      condition: tool.condition,
                      description: tool.description,
                    }}
                    submitLabel="Save changes"
                    onSubmit={async (fields) => {
                      await update({ toolId: tool._id, ...fields });
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-bold [font-stretch:85%]">{tool.name}</p>
                      <p className="text-sm text-ink-soft">
                        {categoryLabel(tool.category)}, {conditionLabel(tool.condition).toLowerCase()} condition ·{" "}
                        <span className={tool.available ? "text-ok" : "text-late"}>
                          {tool.available ? "available today" : "lent out today"}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => setEditing(tool._id)}>Edit</Button>
                      <Button variant="danger" onClick={() => handleRemove(tool._id, tool.name)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
                {rowError?.id === tool._id ? <ErrorText>{rowError.message}</ErrorText> : null}
              </li>
            ))}
          </ul>
        )}
      </ListState>
    </>
  );
}
