// REGENERATED-FROM packages/shared/src/utils/period.ts and
// packages/shared/src/domain/recurrence.ts — fix-plan item 1.5 ("one
// recurrence engine"). Deno Edge Functions deploy only this function's
// own directory tree (no access to the monorepo's `node_modules`
// workspace resolution, and no import map is configured for this
// project — see `supabase/functions/generate-recurring/index.ts`'s own
// header), so the pure functions those two files export are vendored
// here rather than imported. This file is NOT an independent
// implementation: it is a byte-for-byte port of the same algorithm,
// kept here so a Deno `import` resolves without a build step.
//
// DO NOT HAND-EDIT THE LOGIC. When `packages/shared/src/utils/period.ts`
// or `packages/shared/src/domain/recurrence.ts` change, port the change
// here too — same rule the two duplicated `recurringPatternDetector.ts`
// copies were flagged for before fix-plan 1.5 merged them. If Deno ever
// gains workspace-aware resolution (or this project adds an import map
// pointing `@voice-expense/shared` at the real package), delete this
// file and import the real one instead — that is the intended end
// state, not this vendored copy.
//
// Only the subset `generate-recurring/index.ts` actually calls is
// ported: `nextOccurrence` and `occurrencesDue`, plus the civil-date
// primitives they're built on. The pattern detector and the
// window/cost-normalizer helpers (`occurrencesInWindow`,
// `chargesInWindow`, `monthlyEquivalent`) are not — the Edge Function
// has no use for them today.

// ---------------------------------------------------------------------------
// Ported from packages/shared/src/utils/period.ts — the civil-date <->
// instant conversion primitives. See that file for full documentation;
// comments here are trimmed to what a maintainer porting a diff needs.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000

interface LocalParts {
  y: number
  m: number
  d: number
  weekdayIndex: number
  hour: number
  minute: number
  second: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function pad4(n: number): string {
  return String(n).padStart(4, '0')
}
function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString()
}
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

function tzOffsetMsAt(epochMs: number, tz: string): number {
  const parts = partsFormatter(tz).formatToParts(new Date(epochMs))
  const get = (type: string): number => {
    const found = parts.find((p) => p.type === type)
    if (!found) throw new Error(`recurrence.ts (vendored): Intl did not return a "${type}" part for tz "${tz}"`)
    return Number(found.value)
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

function civilDayNumber(y: number, month0: number, d: number): number {
  return Math.floor(Date.UTC(y, month0, d) / MS_PER_DAY)
}

function civilFromDayNumber(dayNumber: number): { y: number; month0: number; d: number } {
  const dt = new Date(dayNumber * MS_PER_DAY)
  return { y: dt.getUTCFullYear(), month0: dt.getUTCMonth(), d: dt.getUTCDate() }
}

function civilWeekdayMonday0(y: number, month0: number, d: number): number {
  const sundayIndexed = new Date(Date.UTC(y, month0, d)).getUTCDay()
  return (sundayIndexed + 6) % 7
}

function localParts(instantIso: string, tz: string): LocalParts {
  const epochMs = Date.parse(instantIso)
  if (Number.isNaN(epochMs)) {
    throw new Error(`recurrence.ts (vendored): "${instantIso}" is not a parseable ISO instant`)
  }
  const parts = partsFormatter(tz).formatToParts(new Date(epochMs))
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value)
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

function localDay(instantIso: string, tz: string): string {
  const { y, m, d } = localParts(instantIso, tz)
  return `${pad4(y)}-${pad2(m)}-${pad2(d)}`
}

function addDays(y: number, m: number, d: number, deltaDays: number): { y: number; m: number; d: number } {
  const { y: ry, month0, d: rd } = civilFromDayNumber(civilDayNumber(y, m - 1, d) + deltaDays)
  return { y: ry, m: month0 + 1, d: rd }
}

function addMonthsClamped(
  y: number,
  m: number,
  d: number,
  deltaMonths: number,
): { y: number; m: number; d: number } {
  const target0 = m - 1 + deltaMonths
  const targetY = y + Math.floor(target0 / 12)
  const targetMonth0 = ((target0 % 12) + 12) % 12
  const daysInTargetMonth = new Date(Date.UTC(targetY, targetMonth0 + 1, 0)).getUTCDate()
  return { y: targetY, m: targetMonth0 + 1, d: Math.min(d, daysInTargetMonth) }
}

function civilDateTimeToInstant(
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

// ---------------------------------------------------------------------------
// Ported from packages/shared/src/domain/recurrence.ts — the subset
// generate-recurring/index.ts calls. See that file for full
// documentation of the design (calendar-rule semantics, why `starts_at`
// is the first occurrence, why the anchor day never comes from a
// previously-emitted occurrence).
// ---------------------------------------------------------------------------

export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurrenceInput {
  frequency: RecurringFrequency
  interval: number
  starts_at: string
  ends_at: string | null
  anchor_day?: number | null
  anchor_weekday?: number | null
  anchor_time?: string | null
}

export interface Occurrence {
  instant: string
  occurrenceDate: string
}

interface ResolvedAnchor {
  day: number
  weekday: number
  hour: number
  minute: number
  second: number
}

function instantMs(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`recurrence.ts (vendored): "${iso}" is not a parseable ISO instant`)
  return ms
}

function parseAnchorTime(raw: string): { hour: number; minute: number; second: number } {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw)
  if (!match) throw new Error(`recurrence.ts (vendored): "${raw}" is not a parseable "HH:MM[:SS]" anchor_time`)
  return { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3] ?? 0) }
}

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
      throw new Error(`recurrence.ts (vendored): unknown frequency "${String(exhaustive)}"`)
    }
  }
}

function buildOccurrence(rule: RecurrenceInput, instant: string, tz: string): Occurrence | null {
  if (rule.ends_at && instantMs(instant) > instantMs(rule.ends_at)) return null
  return { instant, occurrenceDate: localDay(instant, tz) }
}

/** The occurrence immediately following `afterInstant`, or the rule's
 *  first occurrence (`starts_at`) when `afterInstant` is `null`. See
 *  `packages/shared/src/domain/recurrence.ts` for the full rationale —
 *  this is a direct port, not a reimplementation. */
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

/** Every due occurrence (`<= nowInstant`), starting from
 *  `rule.last_generated` (or `starts_at` when null), capped at `limit`.
 *  This is the bounded loop 03-F15 asked for — the Edge Function
 *  previously generated at most one occurrence per rule per run, so a
 *  rule three months behind took three months of daily cron runs to
 *  catch up. */
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
