/**
 * The one recurrence engine — fix-plan item 1.5 ("One recurrence
 * engine"), resolving audit 04-F2, 04-F3, 04-F20, 04-F21, 03-F8,
 * 03-F15, 03-F16, 03-F23, 03-F32, 06-F22, 07-F22.
 *
 * Before this module, "next occurrence" was implemented three times —
 * `apps/mobile/src/hooks/useRecurringRules.ts`, `apps/web/src/app/
 * dashboard/recurring/page.tsx`, `supabase/functions/generate-recurring/
 * index.ts` — all three mutating a `Date` with `setMonth`/`setDate`/
 * `setFullYear`, which (a) overflows instead of clamping at month ends
 * (`new Date(2026,0,31).setMonth(1)` → 3 March, not 28 February —
 * 03-F8/04-F3/06-F22/07-F22) and (b) runs each writer's calendar
 * arithmetic in whatever zone its own runtime happens to be in — device
 * for mobile, UTC for the Edge Function — so the two writers disagree
 * about which instant an occurrence lands on, both insert, and
 * migration 008's dedup index (keyed on a UTC-cast date) cannot see the
 * duplicate (04-F2/04-F21/03-F16).
 *
 * The fix is architectural, not a smarter `Date` mutation: recurrence is
 * defined by a **calendar rule** (an anchor day/weekday/time-of-day in a
 * given timezone), never by mutating an instant. `nextOccurrence`
 * resolves the target as a zoned civil date — using
 * `packages/shared/src/utils/period.ts`, the only module in the repo
 * permitted to touch a calendar getter/setter — and converts to a real
 * instant exactly once, at the end. Two runtimes computing the same
 * rule's next occurrence in different `tz` values (or the same runtime
 * across a DST transition) now produce byte-identical instants, because
 * the wall-clock time-of-day is pinned to the rule's `anchor_time`
 * rather than inherited from whatever offset the previous occurrence
 * happened to resolve to (04-F20).
 *
 * `starts_at` **is** the first occurrence (03-F32): `nextOccurrence(rule,
 * null, tz)` returns `starts_at` unchanged rather than `starts_at + one
 * interval`, which is what let mobile's `createRule` paper over the gap
 * with a `last_generated: now()` write-time workaround. Callers no
 * longer need that workaround — pass `rule.last_generated` (which may
 * legitimately be `null`) straight through.
 *
 * Anchors: `anchor_day` / `anchor_weekday` / `anchor_time` are read from
 * the rule when present (migration 020) and otherwise derived from
 * `starts_at` in `tz` — every rule in production today predates that
 * migration and will always take the derived path, and any future
 * "Add manually" UI can supply them explicitly without this module
 * changing. The day-of-month clamp always uses the resolved `anchor_day`
 * — never a previously *emitted* occurrence's day — which is what makes
 * a rule anchored on the 31st clamp to the 28th in February and then
 * *return* to the 31st in March, rather than drifting permanently to
 * the 3rd the way `setMonth` overflow does (03-F8's fix requirement).
 */
import {
  addDays,
  addMonthsClamped,
  civilDateTimeToInstant,
  daysBetween,
  localDay,
  localParts,
} from '../utils/period'
import type { RecurringFrequency } from '../types/recurring'

/** The minimal shape `nextOccurrence` and friends need. Deliberately not
 *  `RecurringRule` (the generated DB row type): this keeps the engine
 *  pure and testable with plain fixtures, and structurally accepts a
 *  real `RecurringRule` anyway (extra fields are just ignored) — see
 *  the module docstring on why the anchor fields are optional. */
export interface RecurrenceInput {
  frequency: RecurringFrequency
  /** Postgres `NOT NULL DEFAULT 1`. Values other than 1 are honoured
   *  here (03-F23) even though nothing in the repo writes one yet. */
  interval: number
  /** ISO 8601 instant. Also the first occurrence — see module docstring. */
  starts_at: string
  /** ISO 8601 instant, or `null` for a rule with no end. */
  ends_at: string | null
  /** 1–31. Present once migration 020 backfills it; derived from
   *  `starts_at` in `tz` when absent. */
  anchor_day?: number | null
  /** ISO weekday, 1 (Monday) – 7 (Sunday). Descriptive metadata only —
   *  weekly/biweekly stepping is `+7·n`/`+14·n` days, which preserves
   *  the weekday by construction and never consults this field. Derived
   *  from `starts_at` in `tz` when absent. */
  anchor_weekday?: number | null
  /** `"HH:MM"` or `"HH:MM:SS"`, the wall-clock time in `tz` every
   *  occurrence resolves to. Pinning this (rather than inheriting the
   *  previous occurrence's own resolved hour) is what stops the local
   *  hour drifting across a DST transition (04-F20). Derived from
   *  `starts_at` in `tz` when absent. */
  anchor_time?: string | null
}

/** A single resolved occurrence of a rule. */
export interface Occurrence {
  /** The real-world instant this occurrence resolves to, ISO 8601 UTC. */
  instant: string
  /** The civil day (`tz`) `instant` falls on, `YYYY-MM-DD` — the value
   *  the generator writes to `transactions.occurrence_date` (migration
   *  020), which supersedes migration 008's `(transacted_at AT TIME
   *  ZONE 'UTC')::date` dedup key (03-F16/04-F21/06-F22). Because
   *  `instant` is built from this exact civil date via
   *  `civilDateTimeToInstant`, `localDay(instant, tz) ===
   *  occurrenceDate` always holds by construction — it is not a second,
   *  potentially-divergent computation. */
  occurrenceDate: string
}

interface ResolvedAnchor {
  day: number
  weekday: number
  hour: number
  minute: number
  second: number
}

/** `Date.parse` numeric comparison rather than string comparison —
 *  `starts_at`/`ends_at` arrive from PostgREST, which does not
 *  guarantee the `.toISOString()` shape (offset form vs `Z` form sort
 *  differently for a same-second tie — audit 04-F22). Every instant
 *  comparison in this module goes through this rather than `<`/`>` on
 *  the raw strings. */
function instantMs(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`recurrence.ts: "${iso}" is not a parseable ISO instant`)
  return ms
}

function parseAnchorTime(raw: string): { hour: number; minute: number; second: number } {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw)
  if (!match) throw new Error(`recurrence.ts: "${raw}" is not a parseable "HH:MM[:SS]" anchor_time`)
  return { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3] ?? 0) }
}

/** Resolves the rule's anchor day/weekday/time-of-day, falling back to
 *  `starts_at`'s own civil parts in `tz` wherever the rule doesn't carry
 *  an explicit value — see the module docstring. */
function resolveAnchor(rule: RecurrenceInput, tz: string): ResolvedAnchor {
  const start = localParts(rule.starts_at, tz)
  const day = rule.anchor_day ?? start.d
  const weekday = rule.anchor_weekday ?? start.weekdayIndex + 1
  if (rule.anchor_time) {
    const { hour, minute, second } = parseAnchorTime(rule.anchor_time)
    return { day, weekday, hour, minute, second }
  }
  return { day, weekday, hour: start.hour, minute: start.minute, second: start.second }
}

function normalizedInterval(rule: { interval: number }): number {
  const n = Math.trunc(rule.interval)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** The step this rule advances by, expressed in the unit its frequency
 *  is naturally counted in — days for the sub-monthly frequencies
 *  (so DST and day-count arithmetic stay exact, per `addDays`'s
 *  docstring), calendar months for the month-aligned ones (so the
 *  anchor-day clamp — `addMonthsClamped` — applies). Yearly is
 *  `12·interval` months rather than "same month next year(s)" so a
 *  29 February anchor clamps to 28 February on a non-leap target year
 *  via the exact same code path monthly/quarterly use, instead of a
 *  fourth bespoke case. */
function cadenceStep(rule: RecurrenceInput): { unit: 'days' | 'months'; n: number } {
  const interval = normalizedInterval(rule)
  switch (rule.frequency) {
    case 'daily':
      return { unit: 'days', n: interval }
    case 'weekly':
      return { unit: 'days', n: 7 * interval }
    case 'biweekly':
      return { unit: 'days', n: 14 * interval }
    case 'monthly':
      return { unit: 'months', n: interval }
    case 'quarterly':
      return { unit: 'months', n: 3 * interval }
    case 'yearly':
      return { unit: 'months', n: 12 * interval }
    default: {
      const exhaustive: never = rule.frequency
      throw new Error(`recurrence.ts: unknown frequency "${String(exhaustive)}"`)
    }
  }
}

function buildOccurrence(rule: RecurrenceInput, instant: string, tz: string): Occurrence | null {
  if (rule.ends_at && instantMs(instant) > instantMs(rule.ends_at)) return null
  return { instant, occurrenceDate: localDay(instant, tz) }
}

/**
 * The occurrence immediately following `afterInstant`, or the rule's
 * very first occurrence when `afterInstant` is `null` (03-F32 — pass
 * `rule.last_generated` straight through; it is legitimately `null` for
 * a rule that has never generated). Returns `null` once the computed
 * occurrence would fall after `rule.ends_at`.
 *
 * This is the **only** place in the repo permitted to advance a
 * recurring rule's date — mobile, web and the Edge Function all import
 * this rather than each mutating their own `Date` (see module
 * docstring).
 */
export function nextOccurrence(
  rule: RecurrenceInput,
  afterInstant: string | null,
  tz: string,
): Occurrence | null {
  if (afterInstant == null) {
    return buildOccurrence(rule, rule.starts_at, tz)
  }
  const anchor = resolveAnchor(rule, tz)
  const after = localParts(afterInstant, tz)
  const step = cadenceStep(rule)
  const target =
    step.unit === 'days'
      ? addDays(after.y, after.m, after.d, step.n)
      : addMonthsClamped(after.y, after.m, anchor.day, step.n)
  const instant = civilDateTimeToInstant(
    target.y,
    target.m,
    target.d,
    anchor.hour,
    anchor.minute,
    anchor.second,
    tz,
  )
  return buildOccurrence(rule, instant, tz)
}

/**
 * The first occurrence of `rule` on or after `atInstant`, resolved in
 * closed form (a floor-divided cycle count, corrected by at most a
 * couple of `nextOccurrence` steps) rather than by iterating one
 * occurrence at a time from `starts_at` — the fix `03-F25` describes
 * for the web calendar's 60-iteration safety cap, which for a
 * long-overdue daily rule spends every iteration catching up and never
 * reaches the visible window.
 */
export function firstOccurrenceOnOrAfter(
  rule: RecurrenceInput,
  atInstant: string,
  tz: string,
): Occurrence | null {
  if (instantMs(rule.starts_at) >= instantMs(atInstant)) {
    return buildOccurrence(rule, rule.starts_at, tz)
  }
  const anchor = resolveAnchor(rule, tz)
  const start = localParts(rule.starts_at, tz)
  const at = localParts(atInstant, tz)
  const step = cadenceStep(rule)

  const elapsed =
    step.unit === 'days'
      ? daysBetween(start.y, start.m, start.d, at.y, at.m, at.d)
      : (at.y - start.y) * 12 + (at.m - start.m)
  const estimateCycles = Math.max(0, Math.floor(elapsed / step.n))

  const occurrenceAtCycle = (cycles: number): Occurrence | null => {
    const target =
      step.unit === 'days'
        ? addDays(start.y, start.m, start.d, cycles * step.n)
        : addMonthsClamped(start.y, start.m, anchor.day, cycles * step.n)
    const instant = civilDateTimeToInstant(
      target.y,
      target.m,
      target.d,
      anchor.hour,
      anchor.minute,
      anchor.second,
      tz,
    )
    return buildOccurrence(rule, instant, tz)
  }

  // The floor-divided estimate can only under-shoot (never over-shoot) —
  // e.g. when the anchor's time-of-day falls later in the day than
  // `atInstant`'s. A bounded forward correction (not a scan from
  // `starts_at`) closes that gap.
  for (let cycles = estimateCycles; cycles <= estimateCycles + 2; cycles++) {
    const occ = occurrenceAtCycle(cycles)
    if (!occ) return null // past ends_at — no later occurrence can qualify either
    if (instantMs(occ.instant) >= instantMs(atInstant)) return occ
  }
  return null
}

/**
 * Every occurrence of `rule` in the half-open window
 * `[startInstant, endExclusiveInstant)`, ascending. Fast-forwards to the
 * window via `firstOccurrenceOnOrAfter` (see its docstring) so a rule
 * that has been overdue for months still returns promptly for a 30-day
 * window instead of exhausting a fixed iteration cap before it arrives —
 * the specific way the old per-runtime `chargesIn30Days`/
 * `computeUpcomingRecurring` iterations failed (03-F15/03-F25).
 */
export function occurrencesInWindow(
  rule: RecurrenceInput,
  startInstant: string,
  endExclusiveInstant: string,
  tz: string,
  opts: { limit?: number } = {},
): Occurrence[] {
  const limit = opts.limit ?? 10_000
  const out: Occurrence[] = []
  let cursor = firstOccurrenceOnOrAfter(rule, startInstant, tz)
  let iterations = 0
  while (cursor && instantMs(cursor.instant) < instantMs(endExclusiveInstant) && iterations < limit) {
    out.push(cursor)
    cursor = nextOccurrence(rule, cursor.instant, tz)
    iterations++
  }
  return out
}

/**
 * Every occurrence of `rule` that is due — strictly, `<= nowInstant` —
 * starting from `rule.last_generated` (or `starts_at` when that is
 * `null`, per 03-F32), capped at `limit`. This is the bounded `while`
 * loop mobile's `recurringCatchUp.ts` already had and the Edge
 * Function's `generate-recurring` did not (03-F15: the Edge Function
 * generated at most one occurrence per rule per run, so a rule three
 * months behind took three months of daily cron runs to catch up).
 * Both writers now call this one generator.
 */
export function occurrencesDue(
  rule: RecurrenceInput & { last_generated: string | null },
  nowInstant: string,
  tz: string,
  limit = 500,
): Occurrence[] {
  const out: Occurrence[] = []
  let cursor = nextOccurrence(rule, rule.last_generated, tz)
  let iterations = 0
  while (cursor && instantMs(cursor.instant) <= instantMs(nowInstant) && iterations < limit) {
    out.push(cursor)
    cursor = nextOccurrence(rule, cursor.instant, tz)
    iterations++
  }
  return out
}

/** `(rule, occurrence)` pairs for every rule with at least one
 *  occurrence in the window, flattened and sorted by instant —
 *  replaces both mobile's `computeUpcomingRecurring` (which the caller
 *  now gets by filtering the result on `direction`/summing `rule.amount`)
 *  and web's `chargesIn30Days` (calendar-cell placement). Filtering by
 *  `is_active`/`direction` stays the caller's job — this module only
 *  knows how a rule's *date* math works, never its business rules. */
export function chargesInWindow<R extends RecurrenceInput>(
  rules: readonly R[],
  startInstant: string,
  endExclusiveInstant: string,
  tz: string,
): Array<{ rule: R; occurrence: Occurrence }> {
  const out: Array<{ rule: R; occurrence: Occurrence }> = []
  for (const rule of rules) {
    for (const occurrence of occurrencesInWindow(rule, startInstant, endExclusiveInstant, tz)) {
      out.push({ rule, occurrence })
    }
  }
  out.sort((a, b) => instantMs(a.occurrence.instant) - instantMs(b.occurrence.instant))
  return out
}

/**
 * The monthly cost of one occurrence of `rule`, honouring `interval`
 * (03-F23 — every cost normalizer in the repo divided by 1 implicitly,
 * which was unreachable only because no writer ever set `interval != 1`;
 * the date math already handled it, so half-supporting the column is
 * exactly the drift this fix-plan calls out generally).
 */
export function monthlyEquivalent(rule: {
  frequency: RecurringFrequency
  interval: number
  amount: number
}): number {
  const interval = normalizedInterval(rule)
  switch (rule.frequency) {
    // Exact calendar ratios, not the 30 / 4.33 / 2.17 shortcuts this used
    // to ship: a $2,500 biweekly paycheck is $5,416.67/mo (26 ÷ 12), not
    // the $5,425 the rounded factor produced on the Recurring hero.
    case 'daily':
      return (rule.amount * (365.25 / 12)) / interval
    case 'weekly':
      return (rule.amount * (52 / 12)) / interval
    case 'biweekly':
      return (rule.amount * (26 / 12)) / interval
    case 'monthly':
      return rule.amount / interval
    case 'quarterly':
      return rule.amount / (3 * interval)
    case 'yearly':
      return rule.amount / (12 * interval)
    default: {
      const exhaustive: never = rule.frequency
      throw new Error(`recurrence.ts: unknown frequency "${String(exhaustive)}"`)
    }
  }
}

/** `monthlyEquivalent(rule) * 12` — its own export because "annual cost"
 *  is rendered directly (Recurring screens' "Annual cost" stat), not
 *  derived at each call site. */
export function annualEquivalent(rule: {
  frequency: RecurringFrequency
  interval: number
  amount: number
}): number {
  return monthlyEquivalent(rule) * 12
}

/**
 * Shape `recurringFlowInWindow` needs from a rule beyond `RecurrenceInput`
 * — a rule's own FX snapshot (fix-plan 2.1's `amount_in_profile_currency`/
 * `fx_rate_to_profile`/`fx_rate_date`, migration 025), mirroring
 * `SummarizableTransaction` in `packages/shared/src/domain/money.ts`.
 */
export interface RecurringFlowInput extends RecurrenceInput {
  direction: 'debit' | 'credit'
  /** Snapshotted in the profile's currency at rule create/update time.
   *  Null means "awaiting conversion" — never treated as 0 (mirrors
   *  `isFxPending`/`summarize()` in money.ts). */
  amount_in_profile_currency?: number | null
}

/**
 * Every occurrence of every `debit`-direction rule in
 * `[startInstant, endExclusiveInstant)`, summed in the profile's currency
 * — the direction-filtered, FX-normalised, every-occurrence replacement
 * for `computeUpcomingRecurring` (fix-plan 2.1's "Why now": that function
 * summed raw `rule.amount` across currencies and counted only the *next*
 * occurrence, so a weekly $60 rule contributed $60 to a monthly window
 * instead of $240-$300, and an income rule inflated "spend"). Composes
 * `chargesInWindow` (one call per occurrence, not per rule) with each
 * rule's own FX snapshot rather than a fresh lookup per occurrence —
 * projecting a future occurrence at the rule's last-known rate is the
 * same approximation `monthlyEquivalent` already makes for a single
 * occurrence.
 *
 * `pendingCount` is occurrences whose rule has no FX snapshot yet —
 * excluded from `total`, never folded in as 0, same contract as
 * `summarize()`/`sumInProfileCurrency()` in money.ts and fx.ts.
 */
export function recurringOutflowInWindow<R extends RecurringFlowInput>(
  rules: readonly R[],
  startInstant: string,
  endExclusiveInstant: string,
  tz: string,
): { total: number; pendingCount: number } {
  return flowInWindow(rules, 'debit', startInstant, endExclusiveInstant, tz)
}

/** `recurringOutflowInWindow`'s `credit`-direction twin — the "you'll
 *  receive" figure a caller renders as its own labelled total rather
 *  than netting it into (or, worse, subtracting it from) spend. */
export function recurringInflowInWindow<R extends RecurringFlowInput>(
  rules: readonly R[],
  startInstant: string,
  endExclusiveInstant: string,
  tz: string,
): { total: number; pendingCount: number } {
  return flowInWindow(rules, 'credit', startInstant, endExclusiveInstant, tz)
}

function flowInWindow<R extends RecurringFlowInput>(
  rules: readonly R[],
  direction: 'debit' | 'credit',
  startInstant: string,
  endExclusiveInstant: string,
  tz: string,
): { total: number; pendingCount: number } {
  const filtered = rules.filter((r) => r.direction === direction)
  let cents = 0
  let pendingCount = 0
  for (const { rule } of chargesInWindow(filtered, startInstant, endExclusiveInstant, tz)) {
    if (rule.amount_in_profile_currency == null) {
      pendingCount++
      continue
    }
    cents += Math.round(rule.amount_in_profile_currency * 100)
  }
  return { total: cents / 100, pendingCount }
}

/**
 * Shape `findRuleForTransaction` needs from a transaction — deliberately
 * minimal, mirroring `RecurrenceInput`'s own "structurally accepts the
 * real row anyway" contract.
 */
export interface RuleLinkableTransaction {
  id: string
  recurring_rule_id: string | null
}

/** Shape `findRuleForTransaction` needs from a rule. */
export interface RuleLinkTarget {
  id: string
  template_txn_id: string | null
}

/**
 * The one rule↔transaction link, fix-plan 2.2/3.3 (audit finding: the
 * transaction detail screen and the edit screen each hand-rolled their
 * own version of this lookup, and drifted — one checked only
 * `template_txn_id`, which finds the rule for the transaction that
 * *created* it but not for a `recurring_generated` occurrence, whose own
 * `recurring_rule_id` is set directly on the row and whose
 * `template_txn_id` is null).
 *
 * `recurring_rule_id` is authoritative when present — it is written by
 * `link_or_create_recurring_rule` (migration 013/014) for the template
 * transaction, and by the generator for every occurrence after it.
 * `template_txn_id` is the fallback for rows written before that trigger
 * existed, where the rule points at the transaction but the transaction
 * was never linked back.
 */
export function findRuleForTransaction<R extends RuleLinkTarget>(
  txn: RuleLinkableTransaction,
  rules: readonly R[],
): R | null {
  if (txn.recurring_rule_id) {
    const byId = rules.find((r) => r.id === txn.recurring_rule_id)
    if (byId) return byId
  }
  return rules.find((r) => r.template_txn_id === txn.id) ?? null
}

/**
 * Anchor triple (`anchor_day`/`anchor_weekday`/`anchor_time`) plus the
 * `starts_at` instant it was derived from, for a rule being created or
 * re-anchored *from an explicit civil date* — the "Add manually" /
 * "Edit" form path (fix-plan 3.3), as opposed to `createRule`'s
 * template-transaction path, which anchors on the template's own
 * `transacted_at`. Both paths need the same three derived columns
 * (`nextOccurrence`'s `resolveAnchor` reads them when present rather
 * than re-deriving from `starts_at`), so this is the one place that
 * builds them from a `{y,m,d,hour,minute,second}` civil instant instead
 * of leaving each call site to hand-roll the same
 * `String(...).padStart(2,'0')` triple three times over (mobile's
 * `createRule`, web's `acceptCandidate`, and now the manual form on
 * both platforms would have been a fourth and fifth copy).
 */
export function buildRuleAnchor(
  instant: string,
  tz: string,
): { starts_at: string; anchor_day: number; anchor_weekday: number; anchor_time: string } {
  const parts = localParts(instant, tz)
  return {
    starts_at: instant,
    anchor_day: parts.d,
    anchor_weekday: parts.weekdayIndex + 1,
    anchor_time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`,
  }
}
