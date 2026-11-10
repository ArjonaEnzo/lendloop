"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { addDays, errorMessage, rangeDays, shortDate, todayUtc, weekendRange } from "@/lib/ui";
import { Button, ErrorText, inputClass } from "./ui";

/** Date-range request. The server re-checks every rule; these checks only save a round trip. */
export function RequestForm({
  toolId,
  toolName,
  onSent,
  onCancel,
}: {
  toolId: Id<"tools">;
  toolName: string;
  onSent: () => void;
  onCancel: () => void;
}) {
  const request = useMutation(api.loans.request);
  const today = todayUtc();
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  // Move focus into the form when it opens, so keyboard and screen reader users land on it.
  useEffect(() => firstField.current?.focus(), []);

  const presets: { label: string; range: [string, string] }[] = [
    { label: "Today", range: [today, today] },
    { label: "This weekend", range: weekendRange(today) },
    { label: "1 week", range: [today, addDays(today, 6)] },
  ];

  function setRange([start, end]: [string, string]) {
    setStart(start);
    setEnd(end);
  }

  function changeStart(value: string) {
    setStart(value);
    if (endDate < value) setEnd(value); // keep the range valid instead of showing an error
  }

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

  const days = rangeDays(startDate, endDate);

  return (
    <form
      onSubmit={submit}
      aria-label={`Request ${toolName}`}
      className="mt-4 rounded-md border-2 border-tag-ink/40 bg-paper p-3 text-ink"
    >
      <div role="group" aria-label="Quick dates" className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = p.range[0] === startDate && p.range[1] === endDate;
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={active}
              onClick={() => setRange(p.range)}
              className={`min-h-9 rounded-full border-2 px-3 text-xs ${
                active ? "border-ink bg-ink text-paper" : "border-ink-soft text-ink"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid gap-2">
        <label className="text-sm">
          From
          <input
            ref={firstField}
            type="date"
            required
            min={today}
            value={startDate}
            onChange={(e) => changeStart(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          Until
          <input
            type="date"
            required
            min={startDate}
            value={endDate}
            onChange={(e) => setEnd(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {days > 0 ? (
        <p aria-live="polite" className="mt-3 font-mono text-sm">
          {shortDate(startDate)} to {shortDate(endDate)}, {days} {days === 1 ? "day" : "days"}
        </p>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <div className="mt-3 flex flex-wrap gap-2">
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
