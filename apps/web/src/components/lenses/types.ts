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
  type SummarizableTransaction,
} from '@voice-expense/shared'

export type LensTxn = {
  amount: number
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

export type LensRecurring = {
  name: string | null
  amount: number
  frequency: string
}

export interface LensProps {
  transactions: LensTxn[]
  categories: LensCategory[]
  recurring: LensRecurring[]
  currency: string
  locale: string
  /** Anchor month identity as timezone-independent numbers. Lenses MUST
   *  derive year/month/weekday from these — never from getFullYear()/
   *  getMonth()/getDay() on the Date props below. Those Dates are built in
   *  the server component's timezone (UTC on Vercel) and cross the RSC
   *  boundary as absolute instants: any browser west of UTC reads them as
   *  the previous day, which shifted the whole calendar lens to the wrong
   *  month (the "August shows July 8" production bug). */
  anchorYear: number
  /** 0-based month index, same convention as Date#getMonth(). */
  anchorMonth: number
  /** Inclusive start of the anchor month as an instant. Range comparisons
   *  against other instants only — never call date getters on it. */
  monthStart: Date
  /** Inclusive end of the anchor month as an instant. Same rule. */
  monthEnd: Date
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

/** Lens helper: filter to in-range debits with a resolved category name. */
export function monthDebits(p: LensProps): LensTxn[] {
  const out: LensTxn[] = []
  for (const t of p.transactions) {
    if (t.direction !== 'debit') continue
    const d = new Date(t.transacted_at)
    if (d < p.monthStart || d > p.monthEnd) continue
    out.push(t)
  }
  return out
}

export function monthCredits(p: LensProps): LensTxn[] {
  const out: LensTxn[] = []
  for (const t of p.transactions) {
    if (t.direction !== 'credit') continue
    const d = new Date(t.transacted_at)
    if (d < p.monthStart || d > p.monthEnd) continue
    out.push(t)
  }
  return out
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

/** Every transaction (both directions) within the anchor month —
 *  inclusive of both bounds, matching `monthDebits`/`monthCredits`
 *  below so `monthSummary`'s inputs are exactly their union. This is
 *  the one filtered set every lens should run `summarize()` over. */
export function monthTxns(p: LensProps): LensTxn[] {
  const out: LensTxn[] = []
  for (const t of p.transactions) {
    const d = new Date(t.transacted_at)
    if (d < p.monthStart || d > p.monthEnd) continue
    out.push(t)
  }
  return out
}

/** The one summary every lens — and the Overview header — computes off.
 *  Guarantees income/expense/transfers/saved never diverge between
 *  surfaces (fix-plan 1.4's "Done when": the Overview header, MindMap,
 *  Treemap and Cashflow all render the same four numbers for the same
 *  month). */
export function monthSummary(p: LensProps): MoneySummary {
  return summarize(monthTxns(p).map(toSummarizable))
}
