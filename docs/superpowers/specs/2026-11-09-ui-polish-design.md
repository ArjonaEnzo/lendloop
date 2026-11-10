# UI polish: "Workshop ledger" — design

Date: 2026-11-09 · Branch: `feat/ui-polish` (from `feat/lendloop`) · Scope: UI only. No Convex, auth or security changes.

## Intent

The landing page has a clear identity (pegboard, manila tool tags, condensed Archivo). Once signed in, every view becomes the same white bordered list and the identity disappears. This pass carries the workshop language into every view, fixes the accessibility gaps found in the review, and adds dark mode. The goal is a UI that reads as one designed system, not a template.

Chosen direction: **A. Workshop ledger** (evolve the existing identity). The other directions considered were B "Library card" (editorial) and C "Hardware store" (signage). Research notes are kept outside the repo.

## Signature objects (kept to two)

1. **Manila tag**: the catalog card. It has a punched hole, a bin code for the category (`PWR`, `HND`, `GRD`, `KIT`, `CMP`, `CLN`, `OTH`), the name, the condition, the owner and availability.
2. **Checkout card + rubber stamp**: the loan row. A mono date line (`Out Nov 12`, `Due Nov 14`, `3 days`) and the status as a slightly rotated stamp with a distinct word per status.

A third object, a label-maker eyebrow above every page title, was considered and dropped. An uppercase label over every heading is template chrome, and two strong objects read better than three. Mono type is used only for dates, bin codes and IDs, which are the things a workshop would print or stamp.

## Behaviour changes (UI only)

- **Catalog:** the list becomes a responsive grid of tag cards (1 column on mobile, 2 on small screens, 3 on large screens). The request form opens inside the card.
- **Request form:** adds quick presets (Today, This weekend, 1 week) and a live range summary ("3 days"). Focus moves to the first field when the form opens. The confirmation is a `role="status"` message.
- **Loans:** a three-step progress bar (requested → approved → returned). It turns red when overdue and stops short on declined or cancelled.
- **My listings:** the "List a tool" form collapses behind a button once the user has at least one listing.
- **Empty states:** a title, one sentence and one action link.
- **Loading:** skeleton blocks with `aria-busy` replace the "Loading…" text.
- **Admin:** a summary strip shows four counts. IDs use the mono font.
- **Landing:** adds a "How it works" section with three steps.
- **Header nav:** stays on one line and scrolls horizontally on mobile. The active link is marked with a signal-yellow underline.

## Accessibility fixes

- Focus ring: the ink color in light mode and signal yellow in dark mode. Both are at least 3:1; the old yellow-on-white was 1.8:1.
- Buttons are at least 40px tall, and chips and nav links are at least 36px.
- Status messages use `role="status"`.
- Status is never shown by color alone: every stamp has its own word.

## Tokens

- New tokens: `--color-on-signal` (always dark text on yellow), `--color-tag-ink` (dark text on manila in both modes), `--color-focus` and `--color-shadow`.
- Dark mode redefines the same tokens under `prefers-color-scheme: dark`, as a "workshop at night" theme. Tailwind v4 utilities read the CSS variables, so components don't change.
- New font: Atkinson Hyperlegible Mono, used for dates, bin codes and IDs. It's from the same family as the body font.

## Builder's calls

- The exact rotation and shadow values, the skeleton shapes and the wording of the empty states.
- Pure helpers (`rangeDays`, `weekendRange`, `categoryCode`) go in `lib/ui.ts` with unit tests.
