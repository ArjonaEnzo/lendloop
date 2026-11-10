"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/lib/ui";
import { useToday } from "@/lib/useToday";

export default function PublicPage() {
  const today = useToday();
  const tools = useQuery(api.tools.listPublic, today ? { today } : "skip");

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
        {/* Reserve the CTA's height: Clerk decides which button to show only after it loads. */}
        <div className="mt-6 min-h-12">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className={buttonClass("primary", "min-h-12 w-full px-6 text-base sm:w-auto")}>
                Sign in to lend or borrow
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/tools"
              className={buttonClass("primary", "min-h-12 w-full px-6 text-base sm:w-auto")}
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
          <p role="status" className="mt-4 text-ink-soft">
            Loading tools…
          </p>
        ) : tools.length === 0 ? (
          <p className="mt-4 text-ink-soft">The board is empty. Sign in and hang the first tool.</p>
        ) : (
          // A rail of tags: swipe sideways on a phone, wrap on wider screens.
          // justify-center-safe centers a short board but never clips a long one.
          <ul className="-mx-4 mt-6 flex snap-x snap-mandatory justify-center-safe gap-5 overflow-x-auto px-4 pb-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {tools.map((tool, i) => (
              <li key={i} className="w-44 shrink-0 snap-center">
                <HangingTag name={tool.name} category={categoryLabel(tool.category)} tilt={i} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="how" className="py-14">
        <h2 id="how" className="font-display text-3xl font-extrabold [font-stretch:80%]">
          How a loan works
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          <Step n={1} title="Hang a tool" stamp={null}>
            List what you&apos;re happy to lend: name, category, condition. It goes straight onto the board.
          </Step>
          <Step n={2} title="Ask for dates" stamp="Pending">
            A neighbor picks the days. The owner gets an email and approves or declines. Approving one declines any overlapping requests.
          </Step>
          <Step n={3} title="Bring it back" stamp="Returned">
            The owner marks it returned. If the due date passes first, LendLoop sends the borrower a reminder.
          </Step>
        </ol>
      </section>
    </>
  );
}

function Step({ n, title, stamp, children }: { n: number; title: string; stamp: string | null; children: ReactNode }) {
  return (
    <li className="border-t-4 border-ink pt-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-xl font-bold [font-stretch:85%]">
          <span className="mr-2 font-mono text-ink-soft">{n}</span>
          {title}
        </p>
        {stamp ? <span className={`stamp ${stamp === "Returned" ? "text-ink-soft" : "text-ink"}`}>{stamp}</span> : null}
      </div>
      <p className="mt-2 text-ink-soft">{children}</p>
    </li>
  );
}

/** A manila tool tag hanging from a pegboard hook. Slight alternating tilt, like real tags. */
function HangingTag({ name, category, tilt }: { name: string; category: string; tilt: number }) {
  const rotation = [-2, 1.5, -1, 2][tilt % 4];
  return (
    <div className="flex flex-col items-center">
      <span aria-hidden className="h-4 w-0.5 bg-ink" />
      <div
        className="on-tag relative w-full rounded-md border-2 border-tag-edge bg-tag px-3 pt-6 pb-3 text-center"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <span aria-hidden className="absolute top-2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-tag-edge bg-hole" />
        <p className="font-display text-lg leading-tight font-bold [font-stretch:85%]">{name}</p>
        <p className="mt-1 text-sm text-tag-soft">{category}</p>
      </div>
    </div>
  );
}
