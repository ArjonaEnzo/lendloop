"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { buttonClass } from "./ui";

const LINKS = [
  { href: "/tools", label: "Catalog" },
  { href: "/my/listings", label: "My listings" },
  { href: "/my/requests", label: "My requests" },
  { href: "/my/incoming", label: "Incoming requests" },
];

export function Header() {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  // The Admin link is a convenience only: every admin function checks the role on the server.
  const links = me?.role === "admin" ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;

  return (
    <header className="border-b-2 border-ink bg-paper">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pt-3 sm:py-2 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight [font-stretch:80%]"
        >
          {/* The tag hole: the one mark the whole UI is built around. */}
          <span aria-hidden className="h-3.5 w-3.5 rounded-full border-[3px] border-ink bg-signal" />
          LendLoop
        </Link>
        <Show when="signed-in">
          <nav
            aria-label="Main"
            className="order-3 -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 sm:order-none sm:mx-0 sm:w-auto sm:px-0"
          >
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-9 shrink-0 items-center border-b-4 px-2 text-sm whitespace-nowrap ${
                    active ? "border-signal font-bold text-ink" : "border-transparent text-ink-soft hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </Show>
        {/* min-h: the Clerk button appears after hydration; reserve its height so nothing shifts. */}
        <div className="ml-auto flex min-h-10 items-center">
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className={buttonClass("primary")}>Sign in</button>
            </SignInButton>
          </Show>
        </div>
      </div>
    </header>
  );
}
