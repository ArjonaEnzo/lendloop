"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage, todayUtc } from "@/lib/ui";
import { Button, ErrorText, inputClass } from "./ui";

/** Date-range request. The server re-checks every rule; these checks only save a round trip. */
export function RequestForm({
  toolId,
  onSent,
  onCancel,
}: {
  toolId: Id<"tools">;
  onSent: () => void;
  onCancel: () => void;
}) {
  const request = useMutation(api.loans.request);
  const today = todayUtc();
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (endDate < startDate) return setError("End date must be on or after the start date");
    setBusy(true);
    try {
      await request({ toolId, startDate, endDate });
      onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded border-2 border-ink bg-board p-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          From
          <input type="date" required min={today} value={startDate} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          Until
          <input type="date" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </label>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
