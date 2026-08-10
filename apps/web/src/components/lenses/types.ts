// Shared types for the Overview lens components. The Overview page hands
// each lens the same shape; lenses do their own slicing/aggregation off
// this raw data.
//
// All aggregations should use `summarize()`/`monthSummary()` (below) —
// or, for the ~14 sites Stage 2 hasn't migrated, `aggAmount` — from
// `@voice-expense/shared` so multi-currency totals stay coherent and a
// transfer-kind category (Savings & Investing) is never counted as
// spend (fix-plan 1.4). The raw `amount` column is the transaction's
// own currency and is the right field for rendering a single-row
// figure (e.g. "$50 dinner") — never for summing.

import {
  summarize,
  isFxPending,
  type CategoryKind,
  type MoneySummary,
  type RecurringFrequency,
  type SummarizableTransaction,
} from '@voice-expense/shared'

export type LensTxn = {
  amount: number
  /** ISO 4217 code `amount` is denominated in — the transaction's own
   *  currency, e.g. for a foreign-currency purchase. Required so a
   *  per-row figure can be rendered correctly instead of under the
   *  profile's currency symbol (fix-plan 2.4 — the day panel's rows
   *  used to print raw `amount` under the profile symbol beneath a
   *  converted total, so they visibly didn't sum). */
  currency_code: string
  amount_in_profile_currency: number | null
  direction: 'debit' | 'credit'
  category_id: string | null
  category_name: string | null
  /** Resolved `categories.kind` for this transaction's category, or
   *  `null` when uncategorized — the signal `classifyFlow`/`isSpend`
   *  need to tell a transfer (Savings & Investing) apart from ordinary
   *  spend. Falls back to name-matching inside `classifyFlow` itself
   *  when omitted; every lens should still pass it through once it has
   *  it (fix-plan 1.4). */
  category_kind: CategoryKind | null
  merchant: string | null
  merchant_domain: string | null
  transacted_at: string
  is_recurring: boolean
}

export type LensCategory = {
  id: string
  name: string
  kind: CategoryKind
}

/** Fix-plan 2.1: before `direction`/`currency_code`/`interval` were
 *  carried here, MindMap's "Recurring outflow" summed every active
 *  rule's raw `amount` regardless of direction — an onboarding-created
 *  `credit` salary rule inflated the figure exactly like a `debit`
 *  subscription would, and a foreign-currency rule was summed in raw
 *  magnitude against rules in the profile currency. `amount` remains
 *  the rule's own-currency figure (for e.g. "€10/mo" display);
 *  `amount_in_profile_currency` is the FX-converted snapshot every
 *  aggregation must sum instead — `null` means "awaiting conversion",
 *  the same never-fold-in-as-0 contract `isFxPending`/`summarize()`
 *  use elsewhere. */
export type LensRecurring = {
  name: string | null
  amount: number
  amount_in_profile_currency: number | null
  currency_code: string
  direction: 'debit' | 'credit'
  frequency: RecurringFrequency
  interval: number
}

/** One civil day of the anchor month, bucketed once in `dashboard/
 *  page.tsx` (fix-plan 2.4 — "the bucketing happens once") so no lens
 *  repeats its own O(days × transactions) scan or its own calendar
 *  arithmetic. `weekdayIndex` (Monday=0…Sunday=6, from `period.ts`'s
 *  `localParts`) is the single source of weekday-grid alignment —
 *  before this, `Calendar.tsx` derived it from `new Date(year,
 *  monthIdx, 1).getDay()`, which runs in the *browser's* local zone
 *  and put Aug 1 2026 under the wrong column for any browser not in
 *  the profile's zone. */
export interface LensDay {
  /** 1–31. */
  dayOfMonth: number
  /** `YYYY-MM-DD`, the profile-timezone civil day. */
  isoDate: string
  /** Monday = 0 … Sunday = 6. */
  weekdayIndex: number
  /** Half-open UTC instant bounds for this single civil day. */
  windowStart: string
  windowEndExclusive: string
  /** Raw debit total for the day, in the profile currency (FX-pending
   *  rows excluded, never folded in as `0` — fix-plan 1.4). Deliberately
   *  *not* transfer-excluded — Cashflow's running balance and Calendar's
   *  per-day totals both count a Savings & Investing debit, since it
   *  really did leave the checking balance; use `monthSummary()`'s
   *  `expense` for the transfer-aware figure. */
  spendTotal: number
  /** Raw credit total for the day, same currency/exclusion rule and the
   *  same not-transfer-excluded rationale — Cashflow's inflow bars. */
  incomeTotal: number
  /** Every transaction whose local day (in the profile's zone) is this
   *  day — Calendar's day-detail panel. */
  txns: LensTxn[]
}

export interface LensProps {
  transactions: LensTxn[]
  categories: LensCategory[]
  recurring: LensRecurring[]
  currency: string
  locale: string
  /** IANA zone (`profile.timezone`) — the one thing beyond `days`
   *  below a lens is allowed to do its own date math against (e.g.
   *  Matrix's trailing 6 months), and only through
   *  `packages/shared/src/utils/period.ts` — never a local `Date`
   *  getter (fix-plan 2.4). */
  timezone: string
  /** Anchor month identity as timezone-independent numbers — display
   *  only (e.g. MindMap's "{monthLabel} {anchorYear}"). Lenses must
   *  not derive their own date math from these; use `days`/`monthIso`/
   *  `windowStart`/`windowEndExclusive` instead. */
  anchorYear: number
  /** 0-based month index, same convention as Date#getMonth(), for
   *  display only. */
  anchorMonth: number
  /** `YYYY-MM` for the anchor month. */
  monthIso: string
  /** Half-open UTC instant bounds for the whole anchor month
   *  (`monthBounds(monthIso, timezone)`). Every "is this transaction
   *  in the anchor month" filter compares against these two strings —
   *  never a `Date` object. Replaces the old `monthStart`/`monthEnd`
   *  `Date` pair, which crossed the RSC boundary as absolute instants
   *  and were re-read with the *browser's* local getters client-side
   *  (the "August shows July 8" production bug). */
  windowStart: string
  windowEndExclusive: string
  /** One entry per civil day of the anchor month, in calendar order. */
  days: LensDay[]
  /** Today's civil day in `timezone`, `YYYY-MM-DD` — Calendar's "which
   *  cell is today" / "default to today when viewing the current
   *  month" no longer call `new Date()` client-side. */
  todayIso: string
  /** "April" / "Avril" — already localized. */
  monthLabel: string
}

export type LensKey = 'mindmap' | 'flow' | 'calendar' | 'treemap' | 'cashflow' | 'matrix'

export const LENS_KEYS: LensKey[] = ['mindmap', 'flow', 'calendar', 'treemap', 'cashflow', 'matrix']

export function isLensKey(v: unknown): v is LensKey {
  return typeof v === 'string' && (LENS_KEYS as string[]).includes(v)
}

/** Map of category id -> name, used by lenses that need to resolve names. */
export function buildCategoryMap(cats: LensCategory[]): Record<string, string> {
  return Object.fromEntries(cats.map((c) => [c.id, c.name]))
}

/** True when `instant` falls in the anchor month's half-open window —
 *  string comparison against `period.ts`'s bounds, never a `Date`
 *  (fix-plan 2.4). Both sides are `Z`-suffixed UTC instants, the one
 *  format every write path in this repo produces, so lexicographic
 *  comparison is exact — the same assumption `money.ts`'s `summarize()`
 *  window filter relies on. */
function inAnchorMonth(p: LensProps, instant: string): boolean {
  return instant >= p.windowStart && instant < p.windowEndExclusive
}

/** Lens helper: filter to in-range debits with a resolved category name. */
export function monthDebits(p: LensProps): LensTxn[] {
  return p.transactions.filter((t) => t.direction === 'debit' && inAnchorMonth(p, t.transacted_at))
}

export function monthCredits(p: LensProps): LensTxn[] {
  return p.transactions.filter((t) => t.direction === 'credit' && inAnchorMonth(p, t.transacted_at))
}

/** Group transactions by category name (using "Uncategorized" for nulls).
 *  Skips FX-pending rows entirely rather than folding a missing
 *  snapshot in as `0` — the silent-zero pattern fix-plan 1.4 kills
 *  (05-F12/06-F34/07-F8): a row awaiting conversion is invisible money,
 *  not a real zero, so it must never quietly deflate a category total.
 *  Callers that need to tell a user money is missing should check
 *  `monthSummary(p).pendingCount` rather than infer it from a total
 *  that's short. */
export function groupByCategory(txns: LensTxn[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of txns) {
    if (isFxPending(t)) continue
    const key = t.category_name ?? 'Uncategorized'
    out[key] = (out[key] ?? 0) + (t.amount_in_profile_currency as number)
  }
  return out
}

/** Maps a `LensTxn` onto the structural shape `summarize()` needs. */
export function toSummarizable(t: LensTxn): SummarizableTransaction {
  return {
    amount_in_profile_currency: t.amount_in_profile_currency,
    direction: t.direction,
    transacted_at: t.transacted_at,
    category_id: t.category_id,
    category_name: t.category_name,
    category_kind: t.category_kind,
  }
}

/** Every transaction (both directions) within the anchor month's
 *  half-open window — the union of `monthDebits`/`monthCredits` above.
 *  This is the one filtered set every lens should run `summarize()`
 *  over. */
export function monthTxns(p: LensProps): LensTxn[] {
  return p.transactions.filter((t) => inAnchorMonth(p, t.transacted_at))
}

/** The one summary every lens — and the Overview header — computes off.
 *  Guarantees income/expense/transfers/saved never diverge between
 *  surfaces (fix-plan 1.4's "Done when": the Overview header, MindMap,
 *  Treemap and Cashflow all render the same four numbers for the same
 *  month). */
export function monthSummary(p: LensProps): MoneySummary {
  return summarize(monthTxns(p).map(toSummarizable))
}
