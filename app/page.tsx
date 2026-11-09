"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { categoryLabel, todayUtc } from "@/lib/ui";

export default function PublicPage() {
  const [today] = useState(todayUtc);
  const tools = useQuery(api.tools.listPublic, { today });

  return (
    <>
      <section className="pt-12 pb-8 sm:pt-16">
        <h1 className="max-w-3xl font-display text-5xl leading-[0.95] font-extrabold tracking-tight [font-stretch:75%] sm:text-7xl">
          Borrow what you need.
          <br />
          Lend what you don&apos;t.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-soft">
          LendLoop is a tool board for your neighborhood. List the drill you use twice a year, borrow the
          ladder you don&apos;t own.
        </p>
        <div className="mt-6">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded bg-signal px-5 py-3 font-bold text-ink shadow-[3px_3px_0_var(--color-ink)]">
                Sign in to lend or borrow
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/tools"
              className="inline-block rounded bg-signal px-5 py-3 font-bold text-ink shadow-[3px_3px_0_var(--color-ink)]"
            >
              Open the catalog
            </Link>
          </Show>
        </div>
      </section>

      <section aria-labelledby="available" className="pegboard -mx-4 rounded-none border-y-2 border-ink px-4 py-8 sm:mx-0 sm:rounded-lg sm:border-2 sm:px-8">
        <h2 id="available" className="font-display text-2xl font-bold [font-stretch:85%]">
          On the board right now
        </h2>
        {tools === undefined ? (
          <p className="mt-4 text-ink-soft">Loading tools…</p>
        ) : tools.length === 0 ? (
          <p className="mt-4 text-ink-soft">The board is empty. Sign in and hang the first tool.</p>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {tools.map((tool, i) => (
              <li key={i}>
                <HangingTag name={tool.name} category={categoryLabel(tool.category)} tilt={i} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** A manila tool tag hanging from a pegboard hook. Slight alternating tilt, like real tags. */
function HangingTag({ name, category, tilt }: { name: string; category: string; tilt: number }) {
  const rotation = [-2, 1.5, -1, 2][tilt % 4];
  return (
    <div className="flex flex-col items-center">
      <span aria-hidden className="h-4 w-0.5 bg-ink" />
      <div
        className="relative w-full rounded-md border-2 border-tag-edge bg-tag px-3 pt-6 pb-3 text-center"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <span aria-hidden className="absolute top-2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-tag-edge bg-board" />
        <p className="font-display text-lg leading-tight font-bold [font-stretch:85%]">{name}</p>
        <p className="mt-1 text-sm text-ink-soft">{category}</p>
      </div>
    </div>
  );
}
