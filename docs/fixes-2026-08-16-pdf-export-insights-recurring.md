# Fixes — 2026-08-16: PDF export, Insights chart card, Recurring calendar counts

**Scope:** the owner's Aug 16 2026 review of the Export → PDF document
(web/desktop), the Insights "Monthly total · forecast" card, and a
question about the small numbers in the Recurring calendar. Each point
verified in code and against the owner's account data first.

## 1. "The PDF is not beautiful — the numbers are messy, pushed right, there's junk before the dollar sign, no logo, income has no category." Verified: **owner correct on every point.**

### Root cause of the garbled amounts

`export/page.tsx` drew the document with jsPDF's built-in "standard 14"
fonts (`helvetica`, `times`). Those fonts are **WinAnsi-only** — an 8-bit
table. Every character outside it was emitted as whatever glyph sits at
that byte with a bogus advance width:

| String in code | Character | What printed |
|---|---|---|
| `−$50.00` (debit sign) | U+2212 typographic minus | `"` + smeared `$ 5 0 . 0 0` |
| `2026-08-01 → 2026-08-16` (header) | U+2192 arrow | `!'` |
| `1 500,00 $US` (fr locale) | U+202F narrow no-break space | stray glyph |

That is the `" $ 5 0 . 0 0` the owner saw on every row: the leading `"` is
the minus sign, and the letter-spacing is jsPDF mis-measuring the string
after the unknown glyph. Any non-English locale or non-USD currency would
have been worse. This is a *font* defect, not a layout one — no amount of
column tweaking fixes it.

### What ships now

**[apps/web/src/lib/pdf/transactionsPdf.ts](../apps/web/src/lib/pdf/transactionsPdf.ts)** — the
document is a pure function of its input (rows, totals, locale, timezone,
fonts as base64), so it renders identically in the browser and in a node
test.

- **Embedded Unicode font.** Plus Jakarta Sans — the app's own self-hosted
  sans — in a derived build produced by
  [apps/web/scripts/build-pdf-fonts.py](../apps/web/scripts/build-pdf-fonts.py)
  into `apps/web/public/fonts/murmur-pdf-{regular,semibold}.ttf`
  (OFL 1.1, no Reserved Font Name; licence file copied alongside). Two
  adjustments jsPDF cannot make at runtime: **tabular figures as the
  default digits** (the shipped digits are proportional — a `1` is half
  the width of a `0` — which makes right-aligned money columns ragged;
  the cmap now points 0–9 at the font's own `.tf` glyphs, all 600 units)
  and U+202F aliased to the space glyph. `pdfSafe()` additionally folds
  U+00A0/U+2007/U+2009/U+202F to a plain space on every string. Verified
  glyph coverage with fontTools: minus, arrow, en/em dash, €, £, ¥, ₹,
  ₦, ₩ all present. The `Transactions` title keeps jsPDF's Times (closest
  built-in to the brand serif) — safe because it is a fixed ASCII string.
- **Brand mark.** Coin & Wave on a sage tile, drawn as **vectors** (tile,
  coin, two waves as cubic Béziers converted from the SVG's quadratics)
  with the exact geometry of `MurmurMark.tsx`, next to a "Murmur"
  wordmark. Crisp at any zoom; no canvas or image dependency.
- **Income category.** `categoryLabel()`: an uncategorised credit prints
  **Income**, an uncategorised debit prints an em dash. The data layer
  keeps `''`/`null` so CSV/JSON stay honest about "no category".
- **Single Amount column for single-currency users.** The
  native-currency column now appears only when at least one row is in a
  currency other than the profile's; otherwise it was a verbatim
  duplicate of `Amount (USD)`. With one column, that column *is* the
  profile currency, so the printed total still reconciles with a reader
  summing it (fix-plan 2.15's requirement holds).
- **Layout.** Brand row + "Exported …" timestamp; serif title; subtitle
  `13 transactions · Aug 1 – 16, 2026 · Amounts in USD`; totals strip on
  `surface2` with **Total expenses / Total income / Net / Transactions**;
  table with horizontal hairlines only (the old full boxed grid is gone),
  uppercase 7pt column labels, dates in the locale's short form
  (`Aug 8, 2026`), merchant in semibold, credits in the income green,
  every debit prefixed with a real minus; footer on every page with the
  range, the FX-pending note when relevant, and `Page n of N`.
- **Error surfacing.** A failed export (font fetch, jsPDF throw) used to
  vanish into the console with the button silently going idle; the page
  now shows an `ErrorState` under the summary.

Fonts are fetched from `/fonts/…` only when the user clicks PDF (~250 KB,
cached by the browser); on desktop the standalone Next server serves the
same files because `apps/desktop/scripts/bundle-web.mjs` stages
`apps/web/public/`.

**Tests:** [transactionsPdf.test.ts](../apps/web/src/lib/pdf/transactionsPdf.test.ts)
renders with the real font files and the real jsPDF + autoTable in node —
`pdfSafe`, `categoryLabel`, embedded-font resource present, fr-FR + EUR
rows without throwing, pagination + footer for 90 rows. Rasterised the
en-US and fr-FR outputs with Quick Look and inspected them by eye: every
glyph correct, columns aligned to the decimal.

### Mobile ([exportData.ts](../apps/mobile/src/services/exportData.ts))

The mobile PDF goes through WebKit (`expo-print`) so it never had the
glyph problem, but it shared the other three defects. Same fixes: inline
SVG brand mark + wordmark in a brand row above the eyebrow;
`pdfCategoryLabel()` with the localised `voice.income_label`; the
native-currency column only when the export is multi-currency; merchant
in semibold. JS-only — ships with the next TestFlight build.

## 2. "The month names under the Insights chart look like they're outside the card." Verified: **owner correct — they were.**

Two defects in one card. The card had a hard `height: 360` while its own
content needed ≈385px (header block ≈70 + 280px SVG + 36 padding), so the
bottom of the SVG — where the x-axis month labels live — rendered past
the card's bottom edge. And the SVG drew into a fixed 1120-unit viewBox
with `width: 100%`, so on any window wider than ~1150px it was
letterboxed: the plot floated centred with blank card either side and the
`$967` y-axis labels sat mid-card (visible in the owner's screenshot —
the chart starts ~270px right of the card's left edge).

Now: the chart is a client component
([ForecastChart.tsx](../apps/web/src/components/ForecastChart.tsx)) that
measures its container with a `ResizeObserver` and uses that width for
the x-scale (text stays 10px at any width), the fixed card height is
gone so the card sizes to content, and the y-axis labels start at the
card's content edge. Same visuals otherwise.

## 3. "What are the `2` on Aug 25 and the `4` on Sep 8 in the Recurring calendar?" — explained

They are the **number of recurring charges projected to land on that
day** (`chargesByDay[dayOffset].length`, printed at 8px in the cell's
bottom-left corner). Checked against the owner's rules
(`recurring_rules`, profile zone America/Chicago):

- **Aug 25 → 2**: The20 ($1,500, bi-weekly, anchored Tue Aug 11) and
  The20 MSP ($1,000, bi-weekly, anchored Tue Aug 11) both recur Aug 25.
- **Sep 8 → 4**: Xtream ($42, monthly on the 8th) + Charles Schwab
  ($300, monthly on the 8th) + The20 + The20 MSP again (Aug 25 + 14 days
  = Sep 8). That is also why the table's "Next charge" for the two
  monthly rules reads Sep 8.

Note the count mixes bills and expected income (Sep 8 is 2 bills + 2
paychecks). Nothing on the page labels the number, and at 8px with no
unit it reads as noise — the owner's confusion is the design's fault,
not a data bug. **Not changed** (the owner asked for an explanation);
recommended treatment, pending the owner's call: replace the bare
integer with one small dot per charge (bill = ink, income = sage), and a
hover title listing the rule names — the count is then legible without
a legend, and the mixed-direction case stops looking like one number.

## Verification

- `apps/web`: `tsc --noEmit` clean, `eslint` clean on every touched file,
  `vitest run` 38/38 (6 files), `next build` succeeds.
- `apps/mobile`: `tsc --noEmit` clean.
- PDF: rendered en-US and fr-FR (mixed EUR row) documents in node with
  the shipped fonts and inspected the rasterised pages.
