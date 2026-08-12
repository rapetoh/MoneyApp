/**
 * The one place in the repo permitted to call a calendar getter/setter
 * (`getMonth`, `getDate`, `getDay`, `getHours`, `setMonth`, `setDate`,
 * `setFullYear`) or construct a multi-argument `Date`. Everywhere else is
 * enforced by the `no-restricted-syntax` rules in `eslint.config.mjs`
 * (fix-plan item 1.1) once they flip on for this item.
 *
 * fix-plan 1.3 — "One definition of 'a day', 'a week' and 'a month'"
 * (audit 04-F4, 04-F10, 04-F17, 04-F29, 04-F30, 04-F32, 06-F11, 07-F14,
 * 07-F37, 05-F16). Before this module, "August" was computed three
 * different ways on the same page — Vercel-UTC on server components,
 * browser-local on client components, device-local on mobile — because
 * nothing owned the definition. This module owns it.
 *
 * Two rules hold the whole thing together:
 *
 *  1. **A civil calendar day/week/month is defined by an IANA time zone,
 *     never by the runtime's local zone or by UTC.** Every function here
 *     that answers "what day/week/month is this" takes `tz` explicitly —
 *     there is no default. Callers pass `profile.timezone`.
 *
 *  2. **The RSC/serialization boundary rule: functions here take and
 *     return only plain strings and numbers — instants as ISO 8601
 *     strings, civil days as `YYYY-MM-DD`, civil months as `YYYY-MM` —
 *     never `Date` objects.** A `Date` instance serializes unpredictably
 *     across a Next.js server/client boundary and a JSON sync payload
 *     alike; passing one is exactly the class of defect 04-F4 catalogs.
 *     `Date` is used internally as scratch space and never crosses a
 *     function's public signature.
 *
 * Bounds are always **half-open**: `[start, endExclusive)`, both ISO
 * instants. This removes the `23:59:59.000` vs `23:59:59.999` class of
 * off-by-one defect entirely — a range filter is always
 * `>= start AND < endExclusive`.
 *
 * The week starts on Monday (`WEEK_START = 1`, ISO 8601) everywhere in
 * this app. Before this module the week started on Monday in seven call
 * sites and Sunday in three; this is the tie-break, not a preference.
 */

import type { BudgetPeriod } from '../types/budget'

const MS_PER_DAY = 86_400_000

/** ISO 8601 weekday numbering: Monday = 1 … Sunday = 7. This app's week
 *  always starts on Monday — see the module docstring. */
export const WEEK_START = 1 as const

export interface Bounds {
  /** Inclusive lower bound, ISO 8601 instant (UTC). */
  start: string
  /** Exclusive upper bound, ISO 8601 instant (UTC). */
  endExclusive: string
}

export interface LocalParts {
  /** Civil year in `tz`. */
  y: number
  /** Civil month in `tz`, 1–12. */
  m: number
  /** Civil day-of-month in `tz`, 1–31. */
  d: number
  /** Monday = 0 … Sunday = 6 (rotated from `Intl`'s Sunday = 0 to match
   *  `WEEK_START`). */
  weekdayIndex: number
  hour: number
  minute: number
  second: number
}

// ---------------------------------------------------------------------------
// Internal helpers. Nothing below this line is exported — every exported
// function funnels through these instead of touching `Date` getters/setters
// directly, which is what makes the eslint exemption for this one file safe.
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}

function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString()
}

/** Parses an `HH` field that some `Intl` implementations render as `24`
 *  for midnight under `hourCycle: 'h23'`. */
function normalizeHour(h: number): number {
  return h === 24 ? 0 : h
}

const PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let dtf = PARTS_FORMATTER_CACHE.get(tz)
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    PARTS_FORMATTER_CACHE.set(tz, dtf)
  }
  return dtf
}

/** Civil clock fields of `epochMs` as displayed in `tz`. Uses
 *  `formatToParts` where the runtime has it; Hermes (React Native's JS
 *  engine) ships an Intl subset WITHOUT it — `format()` works, so there
 *  the en-US "MM/DD/YYYY, HH:MM:SS" string from the exact same cached
 *  formatter is parsed instead. TestFlight build #6 crashed at boot on
 *  this gap (the runtime-vs-Node difference no unit test can see). */
function civilFieldsAt(epochMs: number, tz: string): Record<string, number> {
  const dtf = partsFormatter(tz)
  if (typeof dtf.formatToParts === 'function') {
    const parts = dtf.formatToParts(new Date(epochMs))
    const out: Record<string, number> = {}
    for (const p of parts) {
      if (p.type !== 'literal') out[p.type] = Number(p.value)
    }
    return out
  }
  const m = dtf.format(new Date(epochMs)).match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})/u)
  if (!m) throw new Error(`period.ts: unparseable DateTimeFormat output for tz "${tz}"`)
  return { month: +m[1], day: +m[2], year: +m[3], hour: +m[4], minute: +m[5], second: +m[6] }
}

/** The offset (ms) such that `epochMs + offset` is the wall-clock instant
 *  `tz` displays at `epochMs`, expressed as if it were itself a UTC
 *  instant. Standard `Intl`-based zone offset technique — no zone
 *  database dependency needed beyond what the runtime already ships. */
function tzOffsetMsAt(epochMs: number, tz: string): number {
  const fields = civilFieldsAt(epochMs, tz)
  const get = (type: string): number => {
    const found = fields[type]
    if (found === undefined || Number.isNaN(found)) throw new Error(`period.ts: Intl did not return a "${type}" part for tz "${tz}"`)
    return found
  }
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    normalizeHour(get('hour')),
    get('minute'),
    get('second'),
  )
  return asIfUtc - epochMs
}

/**
 * Converts a civil wall-clock date/time in `tz` to the real UTC instant
 * it denotes. Two-pass offset resolution (the standard `zonedTimeToUtc`
 * technique): the first pass estimates the zone's offset at the naive
 * guess, the second re-resolves it at the corrected instant so a DST
 * transition on the target day doesn't leave a stale offset applied.
 * `month0` is 0-based, matching `Date.UTC`; callers at the public
 * boundary use 1-based months and convert once, at the edge.
 */
function zonedTimeToUtcMs(
  y: number,
  month0: number,
  d: number,
  h: number,
  min: number,
  s: number,
  ms: number,
  tz: string,
): number {
  const guess = Date.UTC(y, month0, d, h, min, s, ms)
  const offset = tzOffsetMsAt(guess, tz)
  return guess - tzOffsetMsAt(guess - offset, tz)
}

/** A pure proleptic-Gregorian day index for a civil date (`month0` is
 *  0-based). DST-agnostic by construction — it never touches a real zone,
 *  so day-count arithmetic (a week is exactly 7, a fortnight exactly 14)
 *  stays exact even across a DST transition; only the final conversion
 *  back to an instant (`zonedTimeToUtcMs`) needs to know the zone. */
function civilDayNumber(y: number, month0: number, d: number): number {
  return Math.floor(Date.UTC(y, month0, d) / MS_PER_DAY)
}

function civilFromDayNumber(dayNumber: number): { y: number; month0: number; d: number } {
  const dt = new Date(dayNumber * MS_PER_DAY)
  return { y: dt.getUTCFullYear(), month0: dt.getUTCMonth(), d: dt.getUTCDate() }
}

/** Monday = 0 … Sunday = 6 for a civil date, independent of any zone. */
function civilWeekdayMonday0(y: number, month0: number, d: number): number {
  const sundayIndexed = new Date(Date.UTC(y, month0, d)).getUTCDay() // 0=Sun..6=Sat
  return (sundayIndexed + 6) % 7
}

function parseMonthIso(monthIsoStr: string): { y: number; month0: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthIsoStr)
  if (!match) throw new Error(`period.ts: "${monthIsoStr}" is not a "YYYY-MM" month`)
  return { y: Number(match[1]), month0: Number(match[2]) - 1 }
}

function parseLocalDay(dayIsoStr: string): { y: number; month0: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayIsoStr)
  if (!match) throw new Error(`period.ts: "${dayIsoStr}" is not a "YYYY-MM-DD" day`)
  return { y: Number(match[1]), month0: Number(match[2]) - 1, d: Number(match[3]) }
}

/** Half-open bounds for the `lengthDays`-long civil-day span starting at
 *  local midnight on `dayIsoStr`, in `tz`. */
function civilDayBounds(dayIsoStr: string, tz: string, lengthDays: number): Bounds {
  const { y, month0, d } = parseLocalDay(dayIsoStr)
  const startDayNum = civilDayNumber(y, month0, d)
  const start = zonedTimeToUtcMs(y, month0, d, 0, 0, 0, 0, tz)
  const end = civilFromDayNumber(startDayNum + lengthDays)
  const endExclusive = zonedTimeToUtcMs(end.y, end.month0, end.d, 0, 0, 0, 0, tz)
  return { start: toIso(start), endExclusive: toIso(endExclusive) }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Decomposes an instant into its civil parts in `tz`. Everything else
 *  in this module composes from this and from the pure day-number
 *  helpers above; the Intl access itself lives in `civilFieldsAt`,
 *  which is Hermes-safe (no formatToParts dependency). */
export function localParts(instantIso: string, tz: string): LocalParts {
  const epochMs = Date.parse(instantIso)
  if (Number.isNaN(epochMs)) {
    throw new Error(`period.ts: "${instantIso}" is not a parseable ISO instant`)
  }
  const fields = civilFieldsAt(epochMs, tz)
  const get = (type: string): number => Number(fields[type])
  const y = get('year')
  const m = get('month')
  const d = get('day')
  return {
    y,
    m,
    d,
    weekdayIndex: civilWeekdayMonday0(y, m - 1, d),
    hour: normalizeHour(get('hour')),
    minute: get('minute'),
    second: get('second'),
  }
}

/** The civil day an instant falls on in `tz`, as `YYYY-MM-DD`. This is
 *  the function that answers "a US-Central evening transaction lands on
 *  the right day" — `localDay('2026-09-01T01:00:00Z', 'America/Chicago')
 *  === '2026-08-31'`. This is also what gets written once, at create
 *  time, into `transactions.local_day` (see migration 017) — readers
 *  group by the stored column; they never recompute it. */
export function localDay(instantIso: string, tz: string): string {
  const { y, m, d } = localParts(instantIso, tz)
  return `${pad4(y)}-${pad2(m)}-${pad2(d)}`
}

/** The civil month an instant falls on in `tz`, as `YYYY-MM`. */
export function monthIso(instantIso: string, tz: string): string {
  const { y, m } = localParts(instantIso, tz)
  return `${pad4(y)}-${pad2(m)}`
}

/** `monthIso` for right now, in `tz`. The only function in this module
 *  that reads the wall clock — everything else is a pure function of its
 *  arguments, which is what makes the rest of the module trivially
 *  testable without mocking time. */
export function currentMonthIso(tz: string): string {
  return monthIso(new Date().toISOString(), tz)
}

/** Half-open UTC bounds `[start, endExclusive)` for the calendar month
 *  `monthIsoStr` ("YYYY-MM") in `tz`. Handles the year rollover for
 *  December (`endExclusive` normalizes into January of the next year)
 *  via `Date.UTC`'s own month-overflow normalization — no manual
 *  branch needed. */
export function monthBounds(monthIsoStr: string, tz: string): Bounds {
  const { y, month0 } = parseMonthIso(monthIsoStr)
  const start = zonedTimeToUtcMs(y, month0, 1, 0, 0, 0, 0, tz)
  const endExclusive = zonedTimeToUtcMs(y, month0 + 1, 1, 0, 0, 0, 0, tz)
  return { start: toIso(start), endExclusive: toIso(endExclusive) }
}

/** The `YYYY-MM-DD` of the Monday (`WEEK_START`) starting the ISO week
 *  that contains `instantIso`, in `tz`. */
export function weekStart(instantIso: string, tz: string): string {
  const parts = localParts(instantIso, tz)
  const dayNum = civilDayNumber(parts.y, parts.m - 1, parts.d)
  const monday = civilFromDayNumber(dayNum - parts.weekdayIndex)
  return `${pad4(monday.y)}-${pad2(monday.month0 + 1)}-${pad2(monday.d)}`
}

/** Half-open UTC bounds for the Monday–Sunday ISO week containing
 *  `instantIso`, in `tz`. */
export function weekBounds(instantIso: string, tz: string): Bounds {
  return civilDayBounds(weekStart(instantIso, tz), tz, 7)
}

/** Half-open UTC bounds for the calendar quarter (Jan–Mar / Apr–Jun /
 *  Jul–Sep / Oct–Dec) containing `instantIso`, in `tz`. */
function quarterBounds(instantIso: string, tz: string): Bounds {
  const parts = localParts(instantIso, tz)
  const quarterStartMonth0 = Math.floor((parts.m - 1) / 3) * 3
  const start = zonedTimeToUtcMs(parts.y, quarterStartMonth0, 1, 0, 0, 0, 0, tz)
  const endExclusive = zonedTimeToUtcMs(parts.y, quarterStartMonth0 + 3, 1, 0, 0, 0, 0, tz)
  return { start: toIso(start), endExclusive: toIso(endExclusive) }
}

/** Half-open UTC bounds for the calendar year containing `instantIso`,
 *  in `tz`. */
function yearBounds(instantIso: string, tz: string): Bounds {
  const parts = localParts(instantIso, tz)
  const start = zonedTimeToUtcMs(parts.y, 0, 1, 0, 0, 0, 0, tz)
  const endExclusive = zonedTimeToUtcMs(parts.y + 1, 0, 1, 0, 0, 0, 0, tz)
  return { start: toIso(start), endExclusive: toIso(endExclusive) }
}

/** Half-open UTC bounds for the `periodDays`-long cycle containing
 *  `atInstantIso`, where cycle boundaries are fixed by `anchorIso`'s
 *  civil day (e.g. a budget's `starts_at`) rather than floating
 *  relative to "now". Day-count arithmetic happens entirely in the
 *  DST-agnostic proleptic calendar (`civilDayNumber`); only the two
 *  resulting boundary days are converted to real instants. */
function cyclicDayBounds(
  atInstantIso: string,
  tz: string,
  anchorIso: string,
  periodDays: number,
): Bounds {
  const at = localParts(atInstantIso, tz)
  const anchor = localParts(anchorIso, tz)
  const atDayNum = civilDayNumber(at.y, at.m - 1, at.d)
  const anchorDayNum = civilDayNumber(anchor.y, anchor.m - 1, anchor.d)
  const cycleIndex = Math.floor((atDayNum - anchorDayNum) / periodDays)
  const cycleStartDayNum = anchorDayNum + cycleIndex * periodDays
  const startCivil = civilFromDayNumber(cycleStartDayNum)
  const endCivil = civilFromDayNumber(cycleStartDayNum + periodDays)
  const start = zonedTimeToUtcMs(startCivil.y, startCivil.month0, startCivil.d, 0, 0, 0, 0, tz)
  const endExclusive = zonedTimeToUtcMs(endCivil.y, endCivil.month0, endCivil.d, 0, 0, 0, 0, tz)
  return { start: toIso(start), endExclusive: toIso(endExclusive) }
}

/**
 * Half-open UTC bounds for the budget period containing `atInstantIso`,
 * in `tz`. This is the single implementation every `BudgetPeriod` window
 * (mobile's `usePeriodSpend`/`useRecurringRules`, web's
 * `dashboard/budgets/page.tsx`) is meant to converge on — see fix-plan
 * item 1.3's "done when": mobile and web must produce byte-identical
 * bounds for a fixed instant across all five period values.
 *
 * `anchor` (an ISO instant, e.g. the budget's `starts_at`) fixes the
 * phase of a cyclical period. `weekly` ignores it — the ISO week grid is
 * a fixed, anchor-independent convention (`WEEK_START`). `monthly`,
 * `quarterly` and `yearly` are calendar-aligned and also don't need it.
 * `biweekly` has no calendar-native definition — it is *only* meaningful
 * relative to a fixed reference date — so `anchor` is required for it.
 */
export function periodBounds(
  period: BudgetPeriod,
  atInstantIso: string,
  tz: string,
  anchor?: string,
): Bounds {
  switch (period) {
    case 'weekly':
      return weekBounds(atInstantIso, tz)
    case 'biweekly':
      if (!anchor) {
        throw new Error(
          "period.ts: periodBounds('biweekly', ...) requires an anchor instant " +
            "(e.g. the budget's starts_at) to fix the 14-day cycle's phase — " +
            'a floating "last 14 days" window is not a stable definition of a fortnight.',
        )
      }
      return cyclicDayBounds(atInstantIso, tz, anchor, 14)
    case 'monthly':
      return monthBounds(monthIso(atInstantIso, tz), tz)
    case 'quarterly':
      return quarterBounds(atInstantIso, tz)
    case 'yearly':
      return yearBounds(atInstantIso, tz)
    default: {
      const exhaustive: never = period
      throw new Error(`period.ts: periodBounds received an unknown period "${String(exhaustive)}"`)
    }
  }
}

/**
 * Adds `deltaMonths` calendar months to a civil date, clamping the day
 * to the last day of the target month when the source day doesn't exist
 * there (`addMonthsClamped(2026, 1, 31, 1) === { y: 2026, m: 2, d: 28 }`,
 * never "2026-03-03"). Pure civil-date arithmetic — no `tz` parameter,
 * because "which month is one month after January" doesn't depend on a
 * zone, only "which instant that civil date resolves to" does (compose
 * with `zonedTimeToUtcMs`'s public equivalents — `monthBounds` etc. —
 * for that). `m` is 1-based to match every other public function here.
 */
export function addMonthsClamped(
  y: number,
  m: number,
  d: number,
  deltaMonths: number,
): { y: number; m: number; d: number } {
  const target0 = m - 1 + deltaMonths
  const targetY = y + Math.floor(target0 / 12)
  const targetMonth0 = ((target0 % 12) + 12) % 12
  // Day 0 of the *next* month is the last day of the target month —
  // Date.UTC's own overflow normalization, used deliberately here.
  const daysInTargetMonth = new Date(Date.UTC(targetY, targetMonth0 + 1, 0)).getUTCDate()
  return { y: targetY, m: targetMonth0 + 1, d: Math.min(d, daysInTargetMonth) }
}

/**
 * Adds `deltaDays` civil days to a civil date, in the DST-agnostic
 * proleptic calendar — a day is always exactly a day here; the zone only
 * re-enters once the caller converts the result back to an instant with
 * `civilDateTimeToInstant`. Used by the recurrence engine
 * (`packages/shared/src/domain/recurrence.ts`, fix-plan 1.5) for
 * daily/weekly/biweekly stepping, which must not drift by an hour across
 * a DST transition the way `Date.prototype.setDate` does (audit 04-F20).
 */
export function addDays(y: number, m: number, d: number, deltaDays: number): { y: number; m: number; d: number } {
  const { y: ry, month0, d: rd } = civilFromDayNumber(civilDayNumber(y, m - 1, d) + deltaDays)
  return { y: ry, m: month0 + 1, d: rd }
}

/**
 * The number of civil days from `(y1,m1,d1)` to `(y2,m2,d2)`, positive
 * when the second date is later. DST-agnostic proleptic-calendar count —
 * see `addDays`. Used by the recurrence engine to fast-forward a rule
 * to its first occurrence on or after a target instant without iterating
 * one occurrence at a time (audit 03-F25's closed-form fix).
 */
export function daysBetween(y1: number, m1: number, d1: number, y2: number, m2: number, d2: number): number {
  return civilDayNumber(y2, m2 - 1, d2) - civilDayNumber(y1, m1 - 1, d1)
}

/**
 * Converts a civil wall-clock date/time in `tz` to the UTC instant it
 * denotes — the public entry point to the internal `zonedTimeToUtcMs`
 * two-pass resolver for callers outside this module. The recurrence
 * engine is the motivating caller: a calendar rule's target civil date
 * must be resolved to a real instant in exactly one place (fix-plan 1.5
 * / audit 04-F2, 04-F3, 04-F20 — two runtimes each doing their own
 * local-time `Date` mutation is exactly how those defects happened).
 * `m` is 1-based, matching every other public function here.
 */
export function civilDateTimeToInstant(
  y: number,
  m: number,
  d: number,
  h: number,
  minute: number,
  s: number,
  tz: string,
): string {
  return toIso(zonedTimeToUtcMs(y, m - 1, d, h, minute, s, 0, tz))
}

/**
 * Weekday labels for `locale`, starting at `WEEK_START` (Monday). Source
 * of truth for any calendar grid header — replaces every hardcoded
 * Sunday-first label array (wrong for fr/es/pt, which are Monday-first
 * locales). 2023-01-02 is a Monday in UTC; formatting it and the next six
 * UTC midnights gives a locale-correct Monday..Sunday label set with no
 * dependency on the caller's own zone.
 */
export function weekdayLabels(
  locale: string,
  style: 'narrow' | 'short' | 'long' = 'narrow',
): string[] {
  const dtf = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' })
  const mondayFirst = Array.from({ length: 7 }, (_, i) =>
    dtf.format(new Date(Date.UTC(2023, 0, 2 + i))),
  )
  const rotate = (WEEK_START - 1 + 7) % 7
  return [...mondayFirst.slice(rotate), ...mondayFirst.slice(0, rotate)]
}

/**
 * Normalizes an AI-parsed `transacted_at` that carries no real time of day.
 *
 * The parse prompt hands the model a bare civil date ("Use today
 * 2026-08-11 if no date mentioned"), and receipt scans read printed
 * dates — so the model routinely returns a date-only value, which
 * `Date` parsing treats as **midnight UTC**. Rendered in any zone west
 * of UTC that instant belongs to the *previous* civil day: a "$6 today"
 * log surfaced as "Aug 10 · 7:00 PM" under YESTERDAY (found in
 * TestFlight build 8, 2026-08-11).
 *
 * Deterministic repair, no AI-behavior change:
 *   - A value with real time-of-day information passes through untouched.
 *   - A date-only / midnight-UTC value naming **today** (in `tz`) returns
 *     `null` — the caller's create path defaults to now, the honest
 *     moment the user actually logged it.
 *   - A date-only value naming any **other** civil day anchors at noon in
 *     `tz` (noon, not midnight, so no DST transition can shift it across
 *     a day boundary — same anchor the Today screen uses).
 */
export function normalizeParsedTransactedAt(
  iso: string | null | undefined,
  tz: string,
  nowIso: string,
): string | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.0+)?)?(?:Z|\+00:00)?)?$/)
  if (!m) return iso
  const civil = `${m[1]}-${m[2]}-${m[3]}`
  if (civil === localDay(nowIso, tz)) return null
  return civilDateTimeToInstant(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, 0, tz)
}
