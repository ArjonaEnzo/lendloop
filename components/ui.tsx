import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PageTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="pt-10 pb-6">
      <h1 className="font-display text-4xl font-extrabold tracking-tight [font-stretch:80%] sm:text-5xl">{children}</h1>
      {hint ? <p className="mt-2 max-w-2xl text-ink-soft">{hint}</p> : null}
    </div>
  );
}

type Variant = "primary" | "plain" | "danger";

const BASE =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded px-4 py-1.5 text-sm transition-[transform,box-shadow] disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  // The only filled button: signal yellow, pressed into the board on click.
  primary:
    "bg-signal text-on-signal font-bold shadow-[2px_2px_0_var(--color-shadow)] active:translate-x-px active:translate-y-px active:shadow-none",
  plain: "border-2 border-ink bg-paper text-ink hover:bg-board",
  danger: "border-2 border-late bg-paper text-late hover:bg-board",
};

export function buttonClass(variant: Variant = "plain", className = "") {
  return `${BASE} ${VARIANTS[variant]} ${className}`;
}

export function Button({
  variant = "plain",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={buttonClass(variant, className)} />;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-2 text-sm font-bold text-late">
      {children}
    </p>
  );
}

/** Empty state: an invitation to act, not an apology. */
export function Empty({ title, body, action }: { title: string; body?: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-rule p-6 sm:p-8">
      <p className="font-display text-xl font-bold [font-stretch:85%]">{title}</p>
      {body ? <p className="mt-1 max-w-prose text-ink-soft">{body}</p> : null}
      {action ? (
        <Link href={action.href} className={buttonClass("plain", "mt-4")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Loading placeholders shaped like the content that will replace them. */
function Skeleton({ shape }: { shape: "rows" | "tags" }) {
  const blocks = shape === "tags" ? 3 : 2;
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className={shape === "tags" ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>
        {Array.from({ length: blocks }, (_, i) => (
          <div key={i} className={`skeleton ${shape === "tags" ? "h-52" : "h-24"}`} />
        ))}
      </div>
    </div>
  );
}

/** Loading / empty / list in one place so every view handles all three states. */
export function ListState<T>({
  items,
  empty,
  skeleton = "rows",
  children,
}: {
  items: T[] | undefined;
  empty: ReactNode;
  skeleton?: "rows" | "tags";
  children: (items: T[]) => ReactNode;
}) {
  if (items === undefined) return <Skeleton shape={skeleton} />;
  if (items.length === 0) return <>{empty}</>;
  return <>{children(items)}</>;
}

/* Loan status as a rubber stamp. Each status has its own word, so color is never the only signal. */
const STAMP: Record<string, { label: string; className: string }> = {
  requested: { label: "Pending", className: "text-ink" },
  approved: { label: "Approved", className: "text-ok" },
  declined: { label: "Declined", className: "text-late" },
  cancelled: { label: "Cancelled", className: "text-ink-soft" },
  returned: { label: "Returned", className: "text-ink-soft" },
  overdue: { label: "Overdue", className: "border-late bg-late text-paper" },
};

export function StatusStamp({ status, overdue }: { status: string; overdue?: boolean }) {
  const stamp = STAMP[overdue ? "overdue" : status] ?? STAMP.requested;
  return <span className={`stamp ${stamp.className}`}>{stamp.label}</span>;
}

/**
 * Where the loan is: asked, approved, back. Overdue paints the last step red;
 * declined and cancelled stop after the first step.
 */
export function LoanProgress({ status, overdue }: { status: string; overdue?: boolean }) {
  const reached = status === "returned" ? 3 : status === "approved" ? 2 : 1;
  const stopped = status === "declined" || status === "cancelled";
  const steps = ["Requested", "Approved", "Returned"];
  return (
    <ol aria-label="Loan progress" className="mt-3 grid max-w-xs grid-cols-3 gap-1">
      {steps.map((step, i) => {
        const done = !stopped ? i < reached : i === 0;
        const late = overdue && i === 2;
        const color = late ? "bg-late" : done ? (stopped ? "bg-ink-soft" : "bg-ink") : "bg-board-hole";
        return (
          <li key={step} className="text-[0.7rem] text-ink-soft">
            <span aria-hidden className={`mb-1 block h-1.5 rounded-full ${color}`} />
            <span className={done || late ? "text-ink" : undefined}>
              {late ? "Due back" : step}
              <span className="sr-only">{done ? " (done)" : late ? " (overdue)" : " (not yet)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Initial in a circle, for owners and borrowers. */
export function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function TrustedBadge() {
  return <span className="rounded bg-on-signal px-1.5 py-0.5 text-xs font-bold text-signal">Trusted Lender</span>;
}

export const inputClass =
  "mt-1 min-h-10 w-full rounded border-2 border-ink-soft bg-paper px-2 py-1.5 text-ink focus:border-ink";
