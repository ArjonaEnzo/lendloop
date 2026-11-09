"use client";

import { useState, type FormEvent } from "react";
import { CATEGORIES, CONDITIONS, type Category, type Condition, errorMessage } from "@/lib/ui";
import { Button, ErrorText, inputClass } from "./ui";

export type ToolFields = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolFields = { name: "", category: "power_tools", condition: "good", description: "" };

/** Create/edit form. Limits mirror the server (name 80, description 500); the server is the authority. */
export function ToolForm({
  initial = EMPTY,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ToolFields;
  submitLabel: string;
  onSubmit: (fields: ToolFields) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [fields, setFields] = useState<ToolFields>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSubmit(fields);
      if (!onCancel) setFields(EMPTY); // create mode: clear for the next tool
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">
        Name
        <input
          required
          maxLength={80}
          value={fields.name}
          onChange={(e) => setFields({ ...fields, name: e.target.value })}
          className={inputClass}
          placeholder="Cordless drill"
        />
      </label>
      <label className="text-sm">
        Category
        <select
          value={fields.category}
          onChange={(e) => setFields({ ...fields, category: e.target.value as Category })}
          className={inputClass}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Condition
        <select
          value={fields.condition}
          onChange={(e) => setFields({ ...fields, condition: e.target.value as Condition })}
          className={inputClass}
        >
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm sm:col-span-2">
        Short description
        <textarea
          maxLength={500}
          rows={2}
          value={fields.description}
          onChange={(e) => setFields({ ...fields, description: e.target.value })}
          className={inputClass}
          placeholder="18V, two batteries. Pick up after 6pm."
        />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}
