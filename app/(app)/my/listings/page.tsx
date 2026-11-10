"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ToolForm } from "@/components/ToolForm";
import { ToolTag } from "@/components/ToolTag";
import { Button, ErrorText, ListState, PageTitle } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/ui";
import { useToday } from "@/lib/useToday";

export default function MyListingsPage() {
  const today = useToday();
  const tools = useQuery(api.tools.myListings, today ? { today } : "skip");
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  const [rowError, setRowError] = useState<{ id: Id<"tools">; message: string } | null>(null);
  const [removing, setRemoving] = useState<Id<"tools"> | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleRemove(toolId: Id<"tools">, name: string) {
    if (!window.confirm(`Remove "${name}"? Pending requests for it will be declined.`)) return;
    setRowError(null);
    setRemoving(toolId);
    try {
      await remove({ toolId });
    } catch (err) {
      setRowError({ id: toolId, message: errorMessage(err) });
    } finally {
      setRemoving(null);
    }
  }

  const hasListings = (tools?.length ?? 0) > 0;
  const formOpen = adding || (tools !== undefined && !hasListings);

  return (
    <>
      <PageTitle hint="Tools you lend. Neighbors see the name, category, condition and description.">
        My listings
      </PageTitle>

      {formOpen ? (
        <section aria-labelledby="add-tool" className="mb-10 rounded-md border-2 border-ink bg-paper p-4 sm:p-6">
          <h2 id="add-tool" className="mb-1 font-display text-2xl font-bold [font-stretch:85%]">
            {hasListings ? "List another tool" : "Hang your first tool"}
          </h2>
          <p className="mb-4 text-sm text-ink-soft">It shows up in the catalog as soon as you save it.</p>
          <ToolForm
            submitLabel="List tool"
            onSubmit={async (fields) => {
              await create(fields);
              setAdding(false);
            }}
            onCancel={hasListings ? () => setAdding(false) : undefined}
          />
        </section>
      ) : tools !== undefined ? (
        <Button variant="primary" className="mb-8 w-full sm:w-auto" onClick={() => setAdding(true)}>
          List a tool
        </Button>
      ) : null}

      <ListState items={tools} skeleton="tags" empty={null}>
        {(rows) => (
          <ul className="grid items-start gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((tool) =>
              editing === tool._id ? (
                <li key={tool._id} className="sm:col-span-2 lg:col-span-3">
                  <section
                    aria-label={`Edit ${tool.name}`}
                    className="rounded-md border-2 border-ink bg-paper p-4 sm:p-6"
                  >
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
                  </section>
                </li>
              ) : (
                <li key={tool._id}>
                  <ToolTag
                    name={tool.name}
                    category={tool.category}
                    condition={tool.condition}
                    description={tool.description}
                    available={tool.available}
                  >
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => setEditing(tool._id)}>
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        className="flex-1"
                        disabled={removing !== null}
                        onClick={() => handleRemove(tool._id, tool.name)}
                      >
                        {removing === tool._id ? "Removing…" : "Remove"}
                      </Button>
                    </div>
                    {rowError?.id === tool._id ? <ErrorText>{rowError.message}</ErrorText> : null}
                  </ToolTag>
                </li>
              ),
            )}
          </ul>
        )}
      </ListState>
    </>
  );
}
