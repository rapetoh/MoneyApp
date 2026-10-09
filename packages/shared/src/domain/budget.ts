/**
 * The one budget-window and budget-status module — fix-plan item 2.5
 * ("One budget window, one budget status"), resolving audit 04-F9,
 * 04-F12, 04-F28, 04-F34, 05-F5, 05-F17, 05-F18, 05-F23, 05-F31,
 * 08-F14, 08-F15, 08-F16, 08-F46.
 *
 * Before this module, four partial period implementations existed —
 * mobile's `usePeriodSpend` (a branch list ending at `biweekly`, with
 * quarterly/yearly silently falling into the `monthly` `else` branch),
 * web's `budgets/page.tsx`'s `periodStart` (weekly/biweekly/quarterly/
 * yearly/monthly, all hand-rolled, all missing an end bound) — and no
 * two of them agreed for all five `BudgetPeriod` values. Two concrete
 * consequences: a quarterly budget set on web read a different "%
 * used" on mobile under a header that still said QUARTERLY, and a
 * transaction dated any number of days in the future counted against
 * the *current* period because nothing ever compared against an upper
 * bound.
 *
 * `budgetStatus` is the single implementation both platforms render
 * through. It routes the window through `periodBounds()`
 * (`packages/shared/src/utils/period.ts`, fix-plan 1.3) — half-open,
 * `[start, endExclusive)` — anchored on `budget.starts_at`, never
 * "now", so the same budget always resolves to the same window
 * regardless of which instant you ask from. Every filter is
 * `t >= start && t < endExclusive`, which is what makes a future-dated
 * transaction that lands *outside* the current window simply invisible
 * to it (rather than needing a special case), and what makes a
 * transaction dated later than "now" but still *inside* the window
 * count as `committed` rather than `spent` — a bill the user pre-typed
 * for next week is money that's going to leave, not money that has.
 *
 * `committed` folds in two things the audit's "spent" figures always
 * dropped silently: (a) those future-dated-but-in-window transactions,
 * and (b) recurring-rule occurrences due in the window that have not
 * yet posted as a transaction — counted via 1.5's `occurrencesInWindow`
 * against the rule's own FX-snapshotted `amount_in_profile_currency`
 * (migration 025, fix-plan 2.1), minus however many occurrences of that
 * rule *have* already posted (matched by `recurring_rule_id`), so a
 * partially-posted weekly rule inside a monthly window doesn't double
 * count the occurrences that already have a real transaction. A rule
 * with no FX snapshot yet and a `currency_code` that doesn't match the
 * budget's is excluded from `committed` rather than summed at face
 * value, which would be silently wrong by the exchange rate.
 */
import { periodBounds, civilDateTimeToInstant, type Bounds } from '../utils/period'
import { occurrencesInWindow, type RecurrenceInput } from './recurrence'
import { isSpend, resolveCategoryKind, type CategoryKind } from './money'
import { roundCents } from '../utils/currency'
import type { BudgetPeriod } from '../types/budget'
import type { TransactionDirection } from '../types/transaction'

/** The minimal transaction shape `budgetStatus` needs. Structurally
 *  typed (same rationale as `money.ts`'s `SummarizableTransaction`) so
 *  it runs over the Supabase row shape and the mobile SQLite shape
 *  alike. `category_name`/`category_kind` are both optional: a caller
 *  without a categories join (mobile's `useTransactions` returns bare
 *  transaction rows) simply gets `classifyFlow`'s direction-only
 *  default — debit is spend, credit is income — which is exactly what
 *  every pre-existing "spent" figure already assumed. */
export interface BudgetStatusTransaction {
  amount_in_profile_currency?: number | null
  direction: TransactionDirection
  transacted_at: string
  category_id?: string | null
  category_name?: string | null
  category_kind?: CategoryKind | null
  /** Links a generated-or-matched transaction back to the rule that
   *  produced it (`transactions.recurring_rule_id`). Used only to keep
   *  `committed` from double-counting an occurrence that already has a
   *  real row — omit it and every due occurrence counts as committed,
   *  which is the safe (slightly conservative) direction to fail in. */
  recurring_rule_id?: string | null
}

/** The minimal recurring-rule shape `budgetStatus` needs: 1.5's
 *  `RecurrenceInput` (the date-math contract) plus the handful of
 *  business-rule fields the date math doesn't know about. */
export interface BudgetStatusRule extends RecurrenceInput {
  id: string
  amount: number
  currency_code: string
  direction: TransactionDirection
  category_id: string | null
  is_active: boolean
  /** Snapshotted in the profile's currency at rule create/update time
   *  (migration 025, fix-plan 2.1). Preferred over `amount`/
   *  `currency_code` below when present — null means "awaiting
   *  conversion", handled the same as a pending transaction (excluded,
   *  never treated as 0). Optional so a caller on a schema that
   *  predates 2.1 still gets the currency-match fallback rather than a
   *  type error. */
  amount_in_profile_currency?: number | null
}

/** The subset of a `Budget` row `budgetStatus` needs to resolve a
 *  window and scope a filter — not the full row, so a caller can pass
 *  a not-yet-persisted draft (e.g. the "New budget" form's live
 *  preview) without fabricating the rest of the columns. */
export interface BudgetStatusInput {
  period: BudgetPeriod
  /** Anchor date/instant — `budget.starts_at`. Accepts either a bare
   *  civil day (`budgets.starts_at` is a Postgres `date`, so this is
   *  what every real caller has) or a full ISO instant; see
   *  `resolveBudgetAnchor`. */
  starts_at: string
  category_id: string | null
  currency_code: string
  amount: number
  /** Budget rollover (migration 040, Oct 2026): what was left (or
   *  overspent) in every past period since the budget started carries
   *  into the current one. Optional so callers on rows that predate the
   *  column read as "off". */
  rollover?: boolean | null
  /** The carry inherited from the budget this one replaced (migration
   *  040), so editing a rollover budget never drops what it had built up.
   *  Counts only while `rollover` is on. */
  rollover_carry_in?: number | null
}

export interface BudgetStatus {
  /** Sum of non-transfer debits already posted in the window, dated at
   *  or before the instant `budgetStatus` was evaluated at. */
  spent: number
  /** Known-but-not-yet-actual outflow inside the same window: posted
   *  transactions dated later than "now" (a pre-logged future bill)
   *  plus not-yet-posted recurring-rule occurrences. Never overlaps
   *  `spent` — see the module docstring. */
  committed: number
  /** What past periods carried in (plus any `rollover_carry_in`):
   *  positive when they came in under budget, negative when they ran
   *  over. Always `0` with rollover off. */
  carryover: number
  /** What this period has to spend: `budget.amount + carryover`. Every
   *  "of $X" and every ring fills against this, never the bare amount. */
  available: number
  /** `budget.amount + carryover - spent - committed`, unclamped — a
   *  negative value is "over by", which is a rendering decision, not this
   *  module's. */
  remaining: number
  /** `(spent + committed) / (budget.amount + carryover)`, unclamped for
   *  the same reason. With nothing left to spend (an amount, plus
   *  carryover, of zero or less) it is `1` once anything is spent and `0`
   *  otherwise. */
  pct: number
  /** The half-open window this status was computed over — the same
   *  bounds a "days left" countdown must derive from, so the countdown
   *  and the figure beside it can never again disagree (audit 05-F17's
   *  "the number respects the period while the label says 'left this
   *  month'"). */
  window: Bounds
  /** Count of in-window transactions still awaiting an FX snapshot
   *  (`amount_in_profile_currency == null`) — excluded from both
   *  `spent` and `committed` rather than silently folded in as `0`
   *  (fix-plan 1.4's invariant, applied here too). */
  pendingCount: number
}

/**
 * Resolves a budget's anchor to an ISO instant in `tz`. `budgets.
 * starts_at` is a bare civil day (`YYYY-MM-DD`, Postgres `date`) on
 * every real row — converted to that day's local midnight in `tz` via
 * `civilDateTimeToInstant` (1.3) rather than left to `Date`'s own
 * implicit-UTC parsing of a date-only string, which is the runtime's
 * zone, not the user's. Accepts an already-instant string unchanged
 * (`Date.parse` disambiguates the two shapes) so a caller migrating a
 * draft/legacy value doesn't need to know which one it has.
 */
export function resolveBudgetAnchor(startsAt: string, tz: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startsAt)
  if (!dateOnly) return startsAt
  return civilDateTimeToInstant(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]), 0, 0, 0, tz)
}

/**
 * The one budget-status computation. See the module docstring for
 * `spent`/`committed`'s exact split. `atInstantIso` defaults to the
 * real wall clock — the one impure default in this module, mirroring
 * `period.ts`'s own `currentMonthIso()` — and is overridable for
 * deterministic tests.
 */
export function budgetStatus(
  budget: BudgetStatusInput,
  txns: readonly BudgetStatusTransaction[],
  rules: readonly BudgetStatusRule[],
  tz: string,
  atInstantIso: string = new Date().toISOString(),
): BudgetStatus {
  const anchor = resolveBudgetAnchor(budget.starts_at, tz)
  const window = periodBounds(budget.period, atInstantIso, tz, anchor)

  const inWindow = txns.filter(
    (t) => t.transacted_at >= window.start && t.transacted_at < window.endExclusive,
  )
  const scoped =
    budget.category_id == null ? inWindow : inWindow.filter((t) => t.category_id === budget.category_id)

  let spentCents = 0
  let committedFromTxnsCents = 0
  let pendingCount = 0
  const postedCountByRule = new Map<string, number>()

  for (const t of scoped) {
    if (t.recurring_rule_id) {
      postedCountByRule.set(t.recurring_rule_id, (postedCountByRule.get(t.recurring_rule_id) ?? 0) + 1)
    }
    const categoryKind = resolveCategoryKind(t.category_name, t.category_kind)
    if (!isSpend(t, categoryKind)) continue
    if (t.amount_in_profile_currency == null) {
      pendingCount++
      continue
    }
    const cents = Math.round(t.amount_in_profile_currency * 100)
    if (t.transacted_at > atInstantIso) {
      committedFromTxnsCents += cents
    } else {
      spentCents += cents
    }
  }

  let committedFromRulesCents = 0
  for (const r of rules) {
    if (!r.is_active || r.direction !== 'debit') continue
    if (budget.category_id != null && r.category_id !== budget.category_id) continue
    // Prefer the rule's own FX snapshot (migration 025, fix-plan 2.1);
    // fall back to the raw amount only when the rule's currency already
    // matches the budget's (no conversion needed). A snapshot-less rule
    // in a foreign currency is excluded rather than summed at face
    // value, which would be silently wrong by the exchange rate.
    const perOccurrence =
      r.amount_in_profile_currency ?? (r.currency_code === budget.currency_code ? r.amount : null)
    if (perOccurrence == null) continue
    const due = occurrencesInWindow(r, window.start, window.endExclusive, tz)
    if (due.length === 0) continue
    const posted = postedCountByRule.get(r.id) ?? 0
    const unposted = Math.max(0, due.length - posted)
    if (unposted === 0) continue
    committedFromRulesCents += Math.round(perOccurrence * 100) * unposted
  }

  const spent = roundCents(spentCents / 100)
  const committed = roundCents((committedFromTxnsCents + committedFromRulesCents) / 100)
  const carryover = budget.rollover
    ? roundCents((budget.rollover_carry_in ?? 0) + rolloverCarry(budget, txns, tz, anchor, window))
    : 0
  const available = roundCents(budget.amount + carryover)
  const remaining = roundCents(available - spent - committed)
  const pct = available > 0 ? (spent + committed) / available : spent + committed > 0 ? 1 : 0

  return { spent, committed, carryover, available, remaining, pct, window, pendingCount }
}

/** Past periods walked back for a rollover: 20 years of monthly budgets,
 *  far more than any real history, and a hard stop for a bad anchor. */
const MAX_ROLLOVER_PERIODS = 240

/**
 * What every past period of this budget left over (or overspent), summed:
 * for each window from the one the budget started in up to the one before
 * `current`, `amount - spent`. Past windows have nothing "committed" left;
 * only posted spend counts, with the same scope and FX rules as
 * `budgetStatus` (a row still awaiting conversion is left out, never read
 * as 0).
 */
function rolloverCarry(
  budget: BudgetStatusInput,
  txns: readonly BudgetStatusTransaction[],
  tz: string,
  anchor: string,
  current: Bounds,
): number {
  const windows: Bounds[] = []
  let cursor = current.start
  for (let i = 0; i < MAX_ROLLOVER_PERIODS; i++) {
    const before = new Date(Date.parse(cursor) - 1).toISOString()
    const w = periodBounds(budget.period, before, tz, anchor)
    // Stop at the window the budget started in; earlier ones never had it.
    if (w.endExclusive <= anchor || w.start >= cursor) break
    windows.push(w)
    cursor = w.start
  }
  if (windows.length === 0) return 0

  const earliest = windows[windows.length - 1].start
  const spentByWindow = new Array<number>(windows.length).fill(0)
  for (const t of txns) {
    if (t.transacted_at < earliest || t.transacted_at >= current.start) continue
    if (budget.category_id != null && t.category_id !== budget.category_id) continue
    if (t.amount_in_profile_currency == null) continue
    if (!isSpend(t, resolveCategoryKind(t.category_name, t.category_kind))) continue
    const idx = windows.findIndex((w) => t.transacted_at >= w.start && t.transacted_at < w.endExclusive)
    if (idx >= 0) spentByWindow[idx] += Math.round(t.amount_in_profile_currency * 100)
  }

  const amountCents = Math.round(budget.amount * 100)
  let carryCents = 0
  for (const spent of spentByWindow) carryCents += amountCents - spent
  return roundCents(carryCents / 100)
}

/**
 * The carry a replacement budget inherits when `previous` is retired now
 * (migration 040's `rollover_carry_in`): `previous`'s own carryover as of
 * the current period. The current period itself is not included; the
 * replacement's first window is the current one, so it is counted there.
 * `0` when `previous` did not roll over, or the replacement does not.
 */
export function inheritedCarry(
  previous: BudgetStatusInput | null | undefined,
  replacementRollsOver: boolean,
  txns: readonly BudgetStatusTransaction[],
  tz: string,
  atInstantIso: string = new Date().toISOString(),
): number {
  if (!previous || !previous.rollover || !replacementRollsOver) return 0
  return budgetStatus(previous, txns, [], tz, atInstantIso).carryover
}
