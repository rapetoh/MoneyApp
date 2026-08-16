# Fixes — 2026-08-16: web Overview mind map, Flow lens, list rows

**Scope:** the owner's screenshot review of the web dashboard
(`/dashboard`, Mind map lens) on Aug 16 2026, plus one follow-up about
list rows. Each point verified in code first; verdicts below.

## 1. "Dragging to pan selects text." Verified: **owner correct.**

`MindMap.tsx` handled `pointerdown` without cancelling the browser's
default action and set no `user-select` on the surface, so every drag was
also a native text selection across the node labels — and a drag that
began on a node didn't pan at all (`data-no-pan`).

Now: the lens root is `user-select: none`; `pointerdown` is cancelled;
`MerchantLogo` images are `draggable={false}`. A drag may start
**anywhere** (nodes included) — a pan begins only after 4 px of movement,
so a click on a node is still a click; pointer capture is taken only once
panning (capturing on pointerdown would retarget the click away from the
node); the click that follows a pan is swallowed so releasing over a card
doesn't fold it. `wheel` is now a native `{ passive: false }` listener —
React registers `onWheel` passively, so its `preventDefault()` was ignored
and ⌘+scroll zoomed the *browser page*. Verified headless: a drag started
on a leaf label pans the canvas and `window.getSelection()` stays empty.

## 2. "What is `Committed · $342/mo`?" — explained, and made self-explanatory

It was the **monthly-equivalent total of your recurring *debit* rules** —
Xtream $42 + Charles Schwab $300 (The20 and 20 LLC are credit rules, so
excluded). "How much of every month is already spoken for" — a legitimate
number, shown as a bare leaf with nothing under it and a word nobody would
decode. The Plan branch is now two cards whose numbers explain themselves
because the rules they sum unfold beneath them:

- **Bills & transfers · $342/mo** → Charles Schwab $300/mo, Xtream $42/mo
- **Expected income · $3,667/mo** → The20 $1,500/mo, 20 LLC $1,000/2 wk

The word itself is retired everywhere a user can see it: the Budgets
header on web and mobile said "$X spent · $Y committed · $Z cap" for the
same idea (bills due this period that haven't posted yet) — it now says
**"$Y still due"** in all four locales (`budgets.committed` → "still due" /
"encore à payer" / "pendiente" / "ainda a pagar"), the phrase Ask Murmur
already uses for that figure. `committed` survives only as an internal
field name.

Each rule leaf shows how it's billed in its own currency (`$100 every 2 wk`,
`$1,500/yr`), FX-pending rules are listed but never folded into a total as
0. The old arbitrary `.slice(0, 4)` cap on rules is gone (up to 25 per card,
"+N more" beyond 5). The branch node itself no longer carries a headline
figure — a single number on "Plan" would raise the same question.

## 3. "Unfolded categories overlap." Verified: **owner correct.**

Cards sat on a fixed 64 px pitch and leaves on a fixed 26 px pitch no
matter how many were open — five leaves under Shopping ran straight
through Food & Dining. Replaced with a real tree layout
(`layoutBranches`): each card claims the vertical room its visible leaves
need (or a 48 px minimum), cards stack with a 14 px gap, the branch node
centres on its stack, and the top and bottom branch on each side are
pushed apart so their stacks clear the centre node and each other (never
closer than the classic ±220 px, so a quiet month keeps the radial
silhouette). Cards are a fixed 250 px wide and leaves sit 26 px beyond the
card's outer edge on **both** sides — the left side used to anchor leaves
200 px in from a right-anchored card, so left-hand leaves overlapped their
own card. Nothing is clipped; the SVG connector layer is `overflow:
visible` and the plane grows past its nominal size.

Also added **fit-to-content**: on load, on viewport resize, and via the
"%" button the whole tree — as currently folded — is scaled (≤ 100%) and
centred to clear the title, legend and zoom column. Folding never moves the
view under the pointer.

Verified headless with all four expense categories, both plan cards, the
income category and the savings category unfolded at once (see
`docs/fixes-2026-08-16-web-mindmap.png`): no overlaps on either side.

## 4. "Every transaction should have its logo." Done.

Every leaf is now a chip: 18 px `MerchantLogo` (same favicon pipeline and
fallback chain as the transaction list — merchant initial → category
initial, category colour) + merchant + amount. Merchant leaves carry the
first `merchant_domain` seen for that merchant; rule leaves resolve from
the rule name via `guessDomain`. Income categories now unfold to their
payers too (they had no leaves before) — one structure for every branch.

## 5. Flow lens removed (owner decision). Treemap / Calendar / Cashflow / Matrix stay.

`lenses/Flow.tsx` deleted; `LensKey`/`LENS_KEYS`, `LensPills` (pill +
glyph) and `dashboard/page.tsx` updated. `?lens=flow` in an old URL falls
back to the mind map via the existing `isLensKey` guard.

## 6. List rows: click-to-edit replaced by explicit Edit / Delete (owner, same day)

`/dashboard/transactions` rendered every row as a `<button>` that opened
the edit form on click; `/dashboard/recurring` did the same with
`role="button"` rows. Rows are inert now. A new last column carries
`RowActions` (`src/components/RowActions.tsx`: pencil = Edit, trash =
Delete/Cancel), quiet at rest (55%) and forward on row hover or keyboard
focus — the Linear / Notion / Stripe table convention (`globals.css`
`.row-hover`, `.row-actions`, `.row-action-btn`). Transactions: delete now
works straight from the row (`handleDelete(id)`, same soft-delete + 30-day
recovery, same confirm), and the edit form's Delete button calls the same
function; a row-level failure shows above the table instead of inside a
form that isn't open. Recurring: Edit opens the existing modal, Delete is
the existing `handleDeleteRule` (confirm + soft delete). Pause / Resume
pills unchanged. Keyboard reachability (fix-plan 4.1) is now met by the
controls being real buttons rather than by making the row one.

## Verification

- `tsc --noEmit` clean, `eslint` 0 errors (2 pre-existing warnings),
  `vitest` 31/31 (web).
- Mind map: headless Chrome against a fixture route (removed after) —
  default, everything unfolded, "+N more", fit, drag-from-leaf.
- Rows: code-verified only (the pages need a signed-in Supabase session);
  what to eyeball in prod: hover a transaction row → pencil/trash come
  forward; click the row itself → nothing; trash → confirm → row gone.
