import type { ReactNode } from "react";
import { categoryCode, categoryLabel, conditionLabel } from "@/lib/ui";
import { Avatar, TrustedBadge } from "./ui";

/* A shipping tag: corners cut at the hole end. The outer layer is the tag's edge. */
const TAG_SHAPE = "[clip-path:polygon(18px_0,calc(100%-18px)_0,100%_18px,100%_100%,0_100%,0_18px)]";

/**
 * A catalog card shaped like a manila tool tag: punched hole, bin code, name, who lends it,
 * and whether it's free today. `children` is the tag's action area.
 */
export function ToolTag({
  name,
  category,
  condition,
  description,
  available,
  owner,
  mine,
  trusted,
  children,
}: {
  name: string;
  category: string;
  condition: string;
  description?: string;
  available: boolean;
  owner?: string;
  mine?: boolean;
  trusted?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className={`on-tag bg-tag-edge p-[2px] ${TAG_SHAPE}`}>
      <div className={`relative bg-tag px-4 pt-9 pb-4 ${TAG_SHAPE}`}>
        <span
          aria-hidden
          className="absolute top-3 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-[3px] border-tag-edge bg-hole"
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="rounded-sm border-2 border-tag-ink px-1.5 font-mono font-bold" title={categoryLabel(category)}>
            {categoryCode(category)}
            <span className="sr-only">, {categoryLabel(category)}</span>
          </span>
          <span className="text-tag-soft">{conditionLabel(condition)} condition</span>
        </div>

        <h2 className="mt-3 font-display text-2xl leading-tight font-extrabold [font-stretch:82%] [overflow-wrap:anywhere]">
          {name}
        </h2>
        {description ? <p className="mt-1 line-clamp-3 text-sm text-tag-soft">{description}</p> : null}

        <div className="mt-4 border-t-2 border-dashed border-tag-edge pt-3">
          {owner ? (
            <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {mine ? null : <Avatar name={owner} />}
              <span>Lent by {owner}</span>
              {trusted ? <TrustedBadge /> : null}
            </p>
          ) : null}
          <p className={`flex items-center gap-1.5 text-sm font-bold ${available ? "text-tag-ok" : "text-tag-late"}`}>
          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${available ? "bg-tag-ok" : "border-2 border-tag-late"}`} />
            {available ? "Available today" : "Lent out today"}
          </p>
        </div>

        {children ? <div className="mt-4 space-y-2">{children}</div> : null}
      </div>
    </article>
  );
}
