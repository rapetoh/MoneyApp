/**
 * The one pattern-detection module — fix-plan 2.11 ("Insights that
 * only claim what the data supports"), resolving the pattern-claim
 * half of 04-F14, 04-F15, 04-F16, 05-F6, 05-F7, 05-F8, 05-F9, 05-F25,
 * 05-F27, 05-F28, 07-F16, 08-F10, 08-F11, 08-F12.
 *
 * "Saturday is your heaviest day — avg $33" divided a 90-day sum by a
 * literal `12`. "Savings & Investing is 77% of your spend" and "Based
 * on 3 transactions across the last 6 months" both came from a one-day-
 * old account. Every claim below carries its own `sampleSize` and
 * `confident` flag computed from the plan's explicit evidence
 * thresholds — a caller renders the claim only when `confident` is
 * true, on both platforms, because both call the same function.
 */

import { isFxPending } from '../utils/fx'
import { isSpend, resolveCategoryKind, type CategoryKind } from './money'
import { localParts } from '../utils/period'

export interface PatternTxn {
  amount_in_profile_currency?: number | null
  direction: 'debit' | 'credit'
  transacted_at: string
  merchant?: string | null
  category_id?: string | null
  category_name?: string | null
  category_kind?: CategoryKind | null
}

export interface PatternWindow {
  /** Inclusive. */
  start: string
  /** Exclusive. */
  endExclusive: string
}

export type PatternKind = 'heaviest_weekday' | 'category_share' | 'top_merchants' | 'heatmap'

export interface Pattern {
  kind: PatternKind
  /** How many transactions the claim is evidenced by — not the total
   *  transaction count in the window, the count that actually backs
   *  *this* claim (e.g. the count of the specific weekday for
   *  `heaviest_weekday`). */
  sampleSize: number
  confident: boolean
  /** Present only when `confident` — the numbers a caller renders as
   *  copy. Kept as plain data (not a formatted string) so each platform
   *  localizes/formats it itself. */
  data?: Record<string, unknown>
}

function spendAmount(t: PatternTxn): number {
  if (isFxPending(t)) return 0
  const kind = resolveCategoryKind(t.category_name, t.category_kind)
  if (!isSpend(t, kind)) return 0
  return t.amount_in_profile_currency as number
}

function inWindow(t: PatternTxn, w: PatternWindow): boolean {
  return t.transacted_at >= w.start && t.transacted_at < w.endExclusive
}

/**
 * "Heaviest weekday" — the weekday whose *average* spend (weekday total
 * ÷ number of distinct occurrences of that weekday actually present in
 * `window`) is highest. Gated on ≥4 observed instances of that specific
 * weekday **and** ≥12 total spend transactions in the window — one
 * Saturday of logging is not a "heaviest day" pattern. The average
 * divides by the *actual* count of that weekday inside the window
 * (clamped to however much history exists), never a literal `12` or
 * `13` (05-F6's bug).
 */
export function heaviestWeekday(txns: readonly PatternTxn[], window: PatternWindow, tz: string): Pattern {
  const weekdaySums = new Array(7).fill(0)
  const weekdayDays: Array<Set<string>> = Array.from({ length: 7 }, () => new Set())
  let totalSpendTxns = 0

  for (const t of txns) {
    if (!inWindow(t, window)) continue
    const amount = spendAmount(t)
    if (amount <= 0) continue
    totalSpendTxns++
    const parts = localParts(t.transacted_at, tz)
    weekdaySums[parts.weekdayIndex] += amount
    weekdayDays[parts.weekdayIndex].add(`${parts.y}-${parts.m}-${parts.d}`)
  }

  let heaviestIdx = -1
  let heaviestAvg = -1
  let heaviestCount = 0
  for (let i = 0; i < 7; i++) {
    const count = weekdayDays[i].size
    if (count === 0) continue
    const avg = weekdaySums[i] / count
    if (avg > heaviestAvg) {
      heaviestAvg = avg
      heaviestIdx = i
      heaviestCount = count
    }
  }

  const confident = heaviestIdx >= 0 && heaviestCount >= 4 && totalSpendTxns >= 12
  return {
    kind: 'heaviest_weekday',
    sampleSize: heaviestCount,
    confident,
    ...(confident
      ? { data: { weekdayIndex: heaviestIdx, average: heaviestAvg, observedCount: heaviestCount } }
      : {}),
  }
}

/**
 * Largest category's share of total spend in `window`. The denominator
 * is the **full** spend total, never a truncated top-N subtotal
 * (05-F36/05-F37 — a truncated denominator is why six displayed rows
 * always summed to 100% regardless of how many categories actually
 * existed). Gated on ≥10 total spend transactions **and** ≥21 distinct
 * days of history in the window.
 */
export function categoryShare(txns: readonly PatternTxn[], window: PatternWindow, tz: string): Pattern {
  const totals = new Map<string, number>()
  let total = 0
  let count = 0
  const days = new Set<string>()

  for (const t of txns) {
    if (!inWindow(t, window)) continue
    const amount = spendAmount(t)
    if (amount <= 0) continue
    count++
    total += amount
    const parts = localParts(t.transacted_at, tz)
    days.add(`${parts.y}-${parts.m}-${parts.d}`)
    const key = t.category_id ?? '__uncategorized__'
    totals.set(key, (totals.get(key) ?? 0) + amount)
  }

  let topKey: string | null = null
  let topAmount = -1
  for (const [key, amount] of totals) {
    if (amount > topAmount) {
      topAmount = amount
      topKey = key
    }
  }

  const confident = topKey != null && count >= 10 && days.size >= 21 && total > 0
  return {
    kind: 'category_share',
    sampleSize: count,
    confident,
    ...(confident
      ? { data: { categoryId: topKey, amount: topAmount, share: topAmount / total, total } }
      : {}),
  }
}

/**
 * Top merchants by spend in `window`, gated on ≥5 distinct merchants —
 * a comparative bar chart of 2 merchants isn't a comparison.
 */
export function topMerchants(
  txns: readonly PatternTxn[],
  window: PatternWindow,
  limit = 5,
): Pattern & { data?: { merchants: Array<{ merchant: string; amount: number }> } } {
  const totals = new Map<string, number>()
  let count = 0
  for (const t of txns) {
    if (!inWindow(t, window)) continue
    const amount = spendAmount(t)
    if (amount <= 0) continue
    count++
    const key = t.merchant ?? 'Unnamed'
    totals.set(key, (totals.get(key) ?? 0) + amount)
  }
  const sorted = Array.from(totals.entries()).sort(([, a], [, b]) => b - a)
  const confident = sorted.length >= 5
  return {
    kind: 'top_merchants',
    sampleSize: sorted.length,
    confident,
    ...(confident
      ? { data: { merchants: sorted.slice(0, limit).map(([merchant, amount]) => ({ merchant, amount })) } }
      : {}),
  }
}

/** Weekday × hour spend matrix over `window`, all 24 hours (not the
 *  8am–8pm-only bucket set that silently discarded 17:00–02:59 for a
 *  Central user — 04-F16). Gated on ≥20 total spend transactions —
 *  below that, a 7×24 grid is mostly guaranteed-empty cells. */
export function heatmap(
  txns: readonly PatternTxn[],
  window: PatternWindow,
  tz: string,
): Pattern & { data?: { matrix: number[][] } } {
  const matrix: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  let count = 0
  for (const t of txns) {
    if (!inWindow(t, window)) continue
    const amount = spendAmount(t)
    if (amount <= 0) continue
    count++
    const parts = localParts(t.transacted_at, tz)
    matrix[parts.weekdayIndex][parts.hour] += amount
  }
  const confident = count >= 20
  return {
    kind: 'heatmap',
    sampleSize: count,
    confident,
    ...(confident ? { data: { matrix } } : {}),
  }
}

/** Runs every pattern detector over the same window and returns only
 *  the ones with evidence — a caller renders `patterns(...).length ===
 *  0` as "Patterns will appear as your history grows" (the fallback
 *  copy that already existed and was unreachable after a single
 *  transaction pre-2.11, because nothing gated the claims above it). */
export function patterns(txns: readonly PatternTxn[], window: PatternWindow, tz: string): Pattern[] {
  return [heaviestWeekday(txns, window, tz), categoryShare(txns, window, tz), topMerchants(txns, window)].filter(
    (p) => p.confident,
  )
}
