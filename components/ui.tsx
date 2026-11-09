import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PageTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="pt-10 pb-6">
      <h1 className="font-display text-4xl font-extrabold tracking-tight [font-stretch:80%]">{children}</h1>
      {hint ? <p className="mt-2 max-w-2xl text-ink-soft">{hint}</p> : null}
    </div>
  );
}

type Variant = "primary" | "plain" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-signal text-ink font-bold shadow-[2px_2px_0_var(--color-ink)]",
  plain: "border-2 border-ink bg-paper text-ink",
  danger: "border-2 border-late bg-paper text-late",
};

export function Button({
  variant = "plain",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`rounded px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-2 text-sm font-bold text-late">
      {children}
    </p>
  );
}

/** Loading / empty / list in one place so every view handles all three states. */
export function ListState<T>({
  items,
  empty,
  children,
}: {
  items: T[] | undefined;
  empty: ReactNode;
  children: (items: T[]) => ReactNode;
}) {
  if (items === undefined) return <p className="text-ink-soft">Loading…</p>;
  if (items.length === 0) return <div className="rounded-lg border-2 border-dashed border-board-hole bg-paper/60 p-6 text-ink-soft">{empty}</div>;
  return <>{children(items)}</>;
}

const STATUS_STYLE: Record<string, string> = {
  requested: "bg-tag text-ink",
  approved: "bg-ok text-paper",
  declined: "bg-board-hole text-ink",
  cancelled: "bg-board-hole text-ink",
  returned: "bg-paper text-ink-soft border border-ink-soft",
  overdue: "bg-late text-paper",
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Waiting for owner",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  returned: "Returned",
  overdue: "Overdue",
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const key = overdue ? "overdue" : status;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[key]}`}>
      {STATUS_LABEL[key]}
    </span>
  );
}

export const inputClass =
  "mt-1 w-full rounded border-2 border-ink-soft bg-paper px-2 py-1.5 text-ink focus:border-ink";
