/**
 * The one forecast module — fix-plan 2.11 ("Insights that only claim
 * what the data supports"), resolving (the forecasting half of)
 * 04-F14, 04-F15, 04-F16, 05-F6, 05-F7, 05-F8, 05-F9, 05-F25, 05-F27,
 * 05-F28, 05-F36, 05-F37, 08-F10, 08-F11, 08-F12.
 *
 * `392 / 8 × 31 = 1519.0` — a straight run-rate presented as a
 * forecast, drawn as if it were a settled fact, from a one-day-old
 * account, with the projection overwriting the "Actual" series. Mobile
 * already gated its forecast; web had no gate at all — the same
 * account got opposite behaviour on two platforms because nothing
 * shared owned the gate. `forecastMonthly()` is that one owner: both
 * platforms call it and can only render what it returns.
 */

import {
  addDays,
  addMonthsClamped,
  civilDateTimeToInstant,
  daysBetween,
  localDay,
  localParts,
  monthBounds,
  monthIso,
} from '../utils/period'
import { isFxPending } from '../utils/fx'
import { isSpend, resolveCategoryKind, type CategoryKind } from './money'
import { chargesInWindow, type RecurrenceInput } from './recurrence'

/** The structural shape every function in this module needs from a
 *  transaction. `is_recurring` is optional — when a caller has it, the
 *  "variable" daily-spend distribution below excludes recurring-sourced
 *  rows so `recurringCommitted(remaining)` doesn't double-count them;
 *  when omitted, every debit is treated as variable (still correct,
 *  just less precise about the recurring/variable split). */
export interface ForecastTxn {
  amount_in_profile_currency?: number | null
  direction: 'debit' | 'credit'
  transacted_at: string
  category_id?: string | null
  category_name?: string | null
  category_kind?: CategoryKind | null
  is_recurring?: boolean | null
}

/** The structural shape a recurring rule needs — matches
 *  `packages/shared/src/domain/recurrence.ts`'s `RecurrenceInput` plus
 *  `amount`/`direction`, so `chargesInWindow` resolves the rule's
 *  remaining-this-month occurrences and this module prices them. */
export interface ForecastRule extends RecurrenceInput {
  amount: number
  direction: 'debit' | 'credit'
}

export interface MonthlyTotal {
  monthIso: string
  total: number
}

/**
 * Average spend across `months`, excluding any month before
 * `firstTransactionMonthIso` (there is no real "$0" to report for a
 * month the account didn't exist in yet) while *including* a genuine
 * $0 month that falls on or after it — a month with no spending is
 * real information, not missing data (05-F36/05-F37's "filtered out
 * every zero month regardless of cause" bug). Pass `null` for
 * `firstTransactionMonthIso` to include every month given.
 */
export function monthlyAverage(
  months: readonly MonthlyTotal[],
  firstTransactionMonthIso: string | null,
): { avg: number; monthsCovered: number } {
  const covered =
    firstTransactionMonthIso == null
      ? months
      : months.filter((m) => m.monthIso >= firstTransactionMonthIso)
  if (covered.length === 0) return { avg: 0, monthsCovered: 0 }
  const avg = covered.reduce((s, m) => s + m.total, 0) / covered.length
  return { avg, monthsCovered: covered.length }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function pad4(n: number): string {
  return String(n).padStart(4, '0')
}
function dayKey(y: number, m: number, d: number): string {
  return `${pad4(y)}-${pad2(m)}-${pad2(d)}`
}
function monthKey(y: number, m: number): string {
  return `${pad4(y)}-${pad2(m)}`
}

function spendAmount(t: ForecastTxn): number {
  if (isFxPending(t)) return 0
  const kind = resolveCategoryKind(t.category_name, t.category_kind)
  if (!isSpend(t, kind)) return 0
  return t.amount_in_profile_currency as number
}

/** Percentile of a **pre-sorted ascending** array via linear
 *  interpolation between the two nearest ranks — the standard
 *  "R-7"/Excel `PERCENTILE.INC` method. Returns 0 for an empty array. */
function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  if (sortedAsc.length === 1) return sortedAsc[0]
  const idx = (sortedAsc.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo)
}

export interface ForecastResult {
  /** Actual spend from the start of the current month through `now` —
   *  always computable, never gated. */
  monthToDate: number
  /** Point estimate for the full month:
   *  `monthToDate + recurringCommitted(remaining) + medianDailyVariable
   *  × daysRemaining` over a trailing 90-day variable-spend baseline,
   *  excluding transfers (and recurring-sourced rows, when
   *  identifiable). `null` when `confident` is false — the caller must
   *  not render a number. */
  projected: number | null
  /** p25–p75 band around `projected`, from the same trailing-90-day
   *  daily distribution — render this instead of one bold figure.
   *  `null` when `confident` is false. */
  range: { low: number; high: number } | null
  /** Trailing complete-month average, bounded by the account's first
   *  transaction (`monthlyAverage`) — a secondary reference figure, not
   *  the projection itself. `null` when no complete prior month exists. */
  usual: number | null
  /** How many complete prior months back `usual` is averaged over. */
  sampleMonths: number
  /** `true` only when ≥2 complete prior months exist *and* ≥10 distinct
   *  spending days in the trailing 90, OR ≥1 complete prior month *and*
   *  the current civil day-of-month is ≥10. Below this, `projected` and
   *  `range` are `null` and the caller renders "Not enough history
   *  yet" rather than any number. */
  confident: boolean
}

/**
 * The one forecast entry point. Both platforms call this with the same
 * transactions/rules and get byte-identical numbers — the fix for web
 * having no confidence gate while mobile did.
 */
export function forecastMonthly(
  txns: readonly ForecastTxn[],
  recurringRules: readonly ForecastRule[],
  nowInstant: string,
  tz: string,
): ForecastResult {
  const now = localParts(nowInstant, tz)
  const thisMonthIso = monthIso(nowInstant, tz)
  const monthStartBounds = monthBounds(thisMonthIso, tz)

  let monthToDate = 0
  let firstTransactedAt: string | null = null
  for (const t of txns) {
    if (firstTransactedAt == null || t.transacted_at < firstTransactedAt) {
      firstTransactedAt = t.transacted_at
    }
    if (t.transacted_at >= monthStartBounds.start && t.transacted_at < nowInstant) {
      monthToDate += spendAmount(t)
    }
  }
  const firstMonthIso = firstTransactedAt ? monthIso(firstTransactedAt, tz) : null

  // Up to 6 trailing complete calendar months (never before the
  // account's first transaction), each summed independently so a real
  // $0 month stays in the series.
  const monthlyTotals: MonthlyTotal[] = []
  for (let back = 1; back <= 6; back++) {
    const target = addMonthsClamped(now.y, now.m, 1, -back)
    const targetIso = monthKey(target.y, target.m)
    if (firstMonthIso != null && targetIso < firstMonthIso) break
    const bounds = monthBounds(targetIso, tz)
    let total = 0
    for (const t of txns) {
      if (t.transacted_at >= bounds.start && t.transacted_at < bounds.endExclusive) {
        total += spendAmount(t)
      }
    }
    monthlyTotals.unshift({ monthIso: targetIso, total })
  }
  const { avg: usualAvg, monthsCovered } = monthlyAverage(monthlyTotals, firstMonthIso)
  const usual = monthsCovered > 0 ? usualAvg : null

  // Trailing 90-day daily-variable distribution: one bucket per civil
  // day (zero-filled), transfers and (when identifiable) recurring-
  // sourced rows excluded, so it estimates *variable* spend only —
  // `recurringCommitted(remaining)` below prices the recurring half
  // separately rather than blending the two and double-counting.
  const WINDOW_DAYS = 90
  const windowStart = addDays(now.y, now.m, now.d, -(WINDOW_DAYS - 1))
  const windowStartInstant = civilDateTimeToInstant(windowStart.y, windowStart.m, windowStart.d, 0, 0, 0, tz)
  const dailyBuckets = new Map<string, number>()
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const day = addDays(windowStart.y, windowStart.m, windowStart.d, i)
    dailyBuckets.set(dayKey(day.y, day.m, day.d), 0)
  }
  let distinctSpendingDays = 0
  const spendingDaySet = new Set<string>()
  for (const t of txns) {
    if (t.transacted_at < windowStartInstant || t.transacted_at >= nowInstant) continue
    const amount = spendAmount(t)
    if (amount <= 0) continue
    const day = localDay(t.transacted_at, tz)
    spendingDaySet.add(day)
    if (t.is_recurring) continue
    if (dailyBuckets.has(day)) {
      dailyBuckets.set(day, (dailyBuckets.get(day) ?? 0) + amount)
    }
  }
  distinctSpendingDays = spendingDaySet.size
  const dailySorted = Array.from(dailyBuckets.values()).sort((a, b) => a - b)
  const medianDailyVariable = percentile(dailySorted, 0.5)
  const p25Daily = percentile(dailySorted, 0.25)
  const p75Daily = percentile(dailySorted, 0.75)

  const confident =
    (monthsCovered >= 2 && distinctSpendingDays >= 10) || (monthsCovered >= 1 && now.d >= 10)

  if (!confident) {
    return { monthToDate, projected: null, range: null, usual, sampleMonths: monthsCovered, confident: false }
  }

  // Days remaining after "now" in the current civil month.
  const nextMonthStart = addMonthsClamped(now.y, now.m, 1, 1)
  const daysInMonth = daysBetween(now.y, now.m, 1, nextMonthStart.y, nextMonthStart.m, nextMonthStart.d)
  const daysRemaining = Math.max(0, daysInMonth - now.d)

  const remainingCharges = chargesInWindow(recurringRules, nowInstant, monthStartBounds.endExclusive, tz)
  const recurringCommittedRemaining = remainingCharges
    .filter(({ rule }) => rule.direction === 'debit')
    .reduce((s, { rule }) => s + rule.amount, 0)

  const projected = monthToDate + recurringCommittedRemaining + medianDailyVariable * daysRemaining
  const low = monthToDate + recurringCommittedRemaining + p25Daily * daysRemaining
  const high = monthToDate + recurringCommittedRemaining + p75Daily * daysRemaining

  return {
    monthToDate,
    projected,
    range: { low, high },
    usual,
    sampleMonths: monthsCovered,
    confident: true,
  }
}
