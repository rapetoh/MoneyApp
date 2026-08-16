// Tool-calling architecture for Ask Murmur — closed-toolset edition.
//
// The model never does arithmetic and never executes code. It composes
// calls to a fixed set of parameterised aggregation tools over the user's
// transactions and recurring rules; each tool is a plain deterministic
// function with a narrow, typed argument shape. Every number in the
// model's response must trace back to a tool result or the user's own
// question; anything else is rejected by the validator (askMurmur.ts).
//
// fix-plan 2.10 ("Ask Murmur reasons over the same numbers as the rest of
// the app") replaced this module's original `node:vm` sandbox — the
// model used to write arbitrary JavaScript that ran in a hardened VM
// context sharing `Object.prototype` with the Next.js server process.
// That was a real code-execution surface for a well-behaved model to
// trust, not an adversarial one to defend against. The tools below
// remove the surface entirely rather than hardening the VM further: the
// aggregations Ask Murmur needs are enumerable (total, per-category
// breakdown, top merchants, a time series, recurring-commitment total,
// structural comparison), so there is no open-ended computation left
// that a closed toolset can't express. Nothing in this file calls
// `eval`, `Function`, or any VM API — there is no interpreter here to
// escape.
//
// Nine tools (docs/ask-murmur/SPEC.md §3.1):
//   total             — sum over a window, optionally filtered by
//                       direction / category / merchant substring.
//   sum_by_category   — per-category totals over a window, sorted.
//   top_merchants     — ranked merchant totals over a window.
//   series            — a time series bucketed by day/week/month/weekday.
//   list_transactions — the individual rows behind a figure ("what were
//                       those exactly?"), newest first, capped.
//   recurring_total   — normalized monthly/annual recurring commitment,
//                       what is still due this month, and the next
//                       occurrences (when rules carry recurrence fields).
//   arith             — one arithmetic step (ratio, difference, share)
//                       over figures already computed — the model never
//                       does the math itself.
//   can_afford        — the yes/no of "can I afford X" (fits / left /
//                       shortfall) — the model never decides it itself.
//   compare           — structural comparison of two values the model
//                        computed via the tools above. Forces the
//                        verdict's "more A than B" direction to be
//                        correct.
//
// Every date window is built from `packages/shared/src/utils/period.ts`
// (fix-plan 1.3) — civil-day arithmetic in the user's own IANA zone, not
// process-local `Date` getters, which previously ran in whatever zone
// the *process* happened to be in (Vercel's UTC in production, but the
// *test*/*dev* runner's own zone otherwise), not the user's. Every
// monetary figure routes through `t.amount_in_profile_currency`
// (fix-plan 1.4/2.10) — never raw `amount`, which is what let a €50
// dinner count as $50 once the wire contract added a second currency.

import type {
  AskMurmurRecurringRule,
  AskMurmurRecurringRuleV2,
  AskMurmurTransaction,
  RecurringFrequency,
} from '@voice-expense/shared'
import {
  addDays,
  addMonthsClamped,
  civilDateTimeToInstant,
  firstOccurrenceOnOrAfter,
  occurrencesInWindow,
  isSpend,
  localDay,
  localParts,
  monthBounds,
  monthIso,
  monthlyEquivalent,
  periodBounds,
  resolveCategoryKind,
  roundCents,
  summarize,
  weekBounds,
  weekStart,
  weekdayLabels,
  type SummarizableTransaction,
} from '@voice-expense/shared'

/** Cap on a single tool result's serialized size — defense against a
 *  pathological `series` call producing an unreasonable number of
 *  buckets. In practice every tool's output is bounded by the payload
 *  cap (≤ 500 transactions, ≤ 50 recurring rules) and stays a few KB at
 *  most; this is a backstop, not a real constraint under normal use. */
const MAX_TOOL_RESULT_BYTES = 50_000

export interface ToolContext {
  /** Full ISO 8601 instant for "now" — see `AskMurmurRequest.now_utc`. */
  now_utc: string
  /** IANA zone every window below resolves in — see
   *  `AskMurmurRequest.time_zone`. The API route validates this before
   *  constructing a `ToolContext`; this module additionally falls back
   *  to `'UTC'` on anything `Intl` rejects, so a bad value degrades to
   *  UTC math instead of throwing partway through a request. */
  tz: string
  currency: string
  monthly_income: number | null
  locale: string
  transactions: AskMurmurTransaction[]
  recurring_rules: AskMurmurRecurringRuleV2[]
}

export interface ToolCallRecord {
  name: string
  args: unknown
  ok: boolean
  result: unknown
  error?: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Time zone resolution ───────────────────────────────────────────────

const VALID_TZ_CACHE = new Map<string, boolean>()

function isValidTimeZone(tz: string): boolean {
  const cached = VALID_TZ_CACHE.get(tz)
  if (cached !== undefined) return cached
  let ok = true
  try {
    // eslint-disable-next-line no-new -- probing whether `tz` throws is the point.
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    ok = false
  }
  VALID_TZ_CACHE.set(tz, ok)
  return ok
}

/** Resolves `ctx.tz` to a zone `Intl` will actually accept, falling back
 *  to `'UTC'`. Called at every entry point that reads `ctx.tz` so a bad
 *  value never reaches `period.ts` and throws mid-request. */
function resolveTz(tz: string): string {
  return tz && isValidTimeZone(tz) ? tz : 'UTC'
}

// ─── Date windows ───────────────────────────────────────────────────────
//
// Pre-computed `{ start, end }` Date pairs every tool filters against.
// Half-open `[start, end)` — `end` is exclusive — built from
// `packages/shared/src/utils/period.ts`. Boundaries are civil-day
// arithmetic in `tz`, not process-local `Date` getters.

export interface DateWindow {
  start: Date
  end: Date
}

function toDate(iso: string): Date {
  return new Date(iso)
}

/** Resolves `nowUtcStr` to its civil parts in `tz`. Falls back to the
 *  real current instant when `nowUtcStr` doesn't parse. `tz` is assumed
 *  already resolved (see `resolveTz`) — safe to re-use on the fallback
 *  branch without risking a second throw. */
function resolveNowParts(nowUtcStr: string, tz: string): { y: number; m: number; d: number } {
  try {
    return localParts(nowUtcStr, tz)
  } catch {
    return localParts(new Date().toISOString(), tz)
  }
}

function dayWindow(y: number, m: number, d: number, tz: string): DateWindow {
  const start = civilDateTimeToInstant(y, m, d, 0, 0, 0, tz)
  const next = addDays(y, m, d, 1)
  const end = civilDateTimeToInstant(next.y, next.m, next.d, 0, 0, 0, tz)
  return { start: toDate(start), end: toDate(end) }
}

/** Half-open window covering the `n` civil days up to and including
 *  `(y, m, d)`, e.g. `trailingDaysWindow(..., 7)` is "today plus the 6
 *  days before it". */
function trailingDaysWindow(y: number, m: number, d: number, tz: string, n: number): DateWindow {
  const startDay = addDays(y, m, d, -(n - 1))
  const start = civilDateTimeToInstant(startDay.y, startDay.m, startDay.d, 0, 0, 0, tz)
  const end = dayWindow(y, m, d, tz).end
  return { start: toDate(start), end }
}

function monthWindow(y: number, m: number, tz: string): DateWindow {
  const bounds = monthBounds(monthIsoStr(y, m), tz)
  return { start: toDate(bounds.start), end: toDate(bounds.endExclusive) }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function pad4(n: number): string {
  return String(n).padStart(4, '0')
}
function monthIsoStr(y: number, m: number): string {
  return `${pad4(y)}-${pad2(m)}`
}

function yearWindow(y: number, tz: string): DateWindow {
  // periodBounds('yearly', ...) only needs *an* instant inside the target
  // year to resolve the full Jan 1 – Dec 31 span — June 15 at noon is
  // arbitrary and safely clear of any DST-transition edge case.
  const anchorInstant = civilDateTimeToInstant(y, 6, 15, 12, 0, 0, tz)
  const bounds = periodBounds('yearly', anchorInstant, tz)
  return { start: toDate(bounds.start), end: toDate(bounds.endExclusive) }
}

/** Half-open window from the first of the month `n` months before
 *  `(y, m)` through the end of `(y, m, d)` — e.g. `monthsAgoWindow(2026,
 *  5, 3, tz, 5)` is "last 6 months" (the 5 months before May, plus May
 *  itself through the 3rd). */
function monthsAgoWindow(y: number, m: number, d: number, tz: string, n: number): DateWindow {
  const startMonth = addMonthsClamped(y, m, 1, -n)
  const bounds = monthBounds(monthIsoStr(startMonth.y, startMonth.m), tz)
  return { start: toDate(bounds.start), end: dayWindow(y, m, d, tz).end }
}

/** Every argument each tool accepts — `resolveToolCall` rejects anything
 *  else with a self-correcting error rather than dropping it. */
const TOOL_ARG_NAMES: Record<string, Set<string>> = {
  total: new Set(['window', 'start_date', 'end_date', 'direction', 'category_name', 'merchant_contains', 'rule_name']),
  sum_by_category: new Set(['window', 'start_date', 'end_date', 'direction', 'merchant_contains']),
  top_merchants: new Set(['window', 'start_date', 'end_date', 'direction', 'category_name', 'merchant_contains', 'limit']),
  series: new Set(['window', 'start_date', 'end_date', 'bucket', 'direction', 'category_name', 'merchant_contains']),
  list_transactions: new Set(['window', 'start_date', 'end_date', 'direction', 'category_name', 'merchant_contains', 'rule_name', 'min_amount', 'limit']),
  recurring_total: new Set(['direction']),
  recurring_in_window: new Set(['window', 'start_date', 'end_date', 'direction']),
  arith: new Set(['op', 'a', 'b']),
  can_afford: new Set(['available', 'cost']),
  compare: new Set(['a', 'b']),
}

export const WINDOW_NAMES = [
  'today',
  'yesterday',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'lastQuarter',
  'thisYear',
  'lastYear',
  'last7Days',
  'last30Days',
  'last90Days',
  'last6Months',
  'last12Months',
  'nextMonth',
  'next30Days',
  // Any other range — a named month ("June"), "between the 1st and the
  // 10th", a specific quarter of last year — via start_date / end_date
  // (inclusive civil dates in the user's zone). Owner report Aug 15: the
  // fixed list could not answer "last week" or "in June" at all.
  'custom',
] as const

export type WindowName = (typeof WINDOW_NAMES)[number]

/** Every window a tool call can name, resolved from `nowUtcStr` in `tz`.
 *  Exported for its own unit test — the worked example fix-plan 2.10
 *  names directly (`now_utc='2026-01-01T02:00:00Z'`, `America/Chicago`
 *  → a December window) is a `buildWindows` test, not an end-to-end one. */
export function buildWindows(nowUtcStr: string, tz: string): Record<WindowName, DateWindow> {
  const resolvedTz = resolveTz(tz)
  const { y, m, d } = resolveNowParts(nowUtcStr, resolvedTz)
  const prevMonth = addMonthsClamped(y, m, 1, -1)

  const yday = addDays(y, m, d, -1)
  const nowIso = civilDateTimeToInstant(y, m, d, 12, 0, 0, resolvedTz)
  const lastWeekAnchor = (() => { const p = addDays(y, m, d, -7); return civilDateTimeToInstant(p.y, p.m, p.d, 12, 0, 0, resolvedTz) })()
  const thisWeekB = weekBounds(nowIso, resolvedTz)
  const lastWeekB = weekBounds(lastWeekAnchor, resolvedTz)
  const qStartM = Math.floor((m - 1) / 3) * 3 + 1
  const prevQ = addMonthsClamped(y, qStartM, 1, -3)

  return {
    today: dayWindow(y, m, d, resolvedTz),
    yesterday: dayWindow(yday.y, yday.m, yday.d, resolvedTz),
    thisWeek: { start: toDate(thisWeekB.start), end: toDate(thisWeekB.endExclusive) },
    lastWeek: { start: toDate(lastWeekB.start), end: toDate(lastWeekB.endExclusive) },
    thisMonth: monthWindow(y, m, resolvedTz),
    lastMonth: monthWindow(prevMonth.y, prevMonth.m, resolvedTz),
    thisQuarter: quarterWindow(y, qStartM, resolvedTz),
    lastQuarter: quarterWindow(prevQ.y, prevQ.m, resolvedTz),
    thisYear: yearWindow(y, resolvedTz),
    lastYear: yearWindow(y - 1, resolvedTz),
    last7Days: trailingDaysWindow(y, m, d, resolvedTz, 7),
    last30Days: trailingDaysWindow(y, m, d, resolvedTz, 30),
    last90Days: trailingDaysWindow(y, m, d, resolvedTz, 90),
    last6Months: monthsAgoWindow(y, m, d, resolvedTz, 5),
    last12Months: monthsAgoWindow(y, m, d, resolvedTz, 11),
    nextMonth: (() => { const nm = addMonthsClamped(y, m, 1, 1); return monthWindow(nm.y, nm.m, resolvedTz) })(),
    next30Days: (() => { const start = dayWindow(y, m, d, resolvedTz).start; const e = addDays(y, m, d, 30); return { start, end: toDate(civilDateTimeToInstant(e.y, e.m, e.d, 0, 0, 0, resolvedTz)) } })(),
    // Placeholder — a 'custom' filter is resolved from its own dates by
    // `resolveWindow`; this entry only keeps the record shape total.
    custom: { start: new Date(0), end: new Date(0) },
  }
}

/** Calendar quarter starting at month `qStartM` (1, 4, 7, 10) of `y`. */
function quarterWindow(y: number, qStartM: number, tz: string): DateWindow {
  const startB = monthBounds(monthIsoStr(y, qStartM), tz)
  const endMonth = addMonthsClamped(y, qStartM, 1, 2)
  const endB = monthBounds(monthIsoStr(endMonth.y, endMonth.m), tz)
  return { start: toDate(startB.start), end: toDate(endB.endExclusive) }
}

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseCivilDate(v: unknown, field: string): { y: number; m: number; d: number } | undefined {
  if (v == null || v === '') return undefined
  const m = typeof v === 'string' ? CIVIL_DATE_RE.exec(v.trim()) : null
  if (!m) throw new Error(`"${field}" must be a civil date YYYY-MM-DD; got ${JSON.stringify(v)}`)
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  if (mo < 1 || mo > 12 || d < 1 || d > dim) throw new Error(`"${field}" is not a real calendar date: ${v}`)
  return { y, m: mo, d }
}

/** The window a filter names — a named window, or for 'custom' the
 *  inclusive civil range [start_date, end_date] in the user's zone. */
function resolveWindow(filter: RowFilter, windows: Record<WindowName, DateWindow>, ctx: ToolContext): DateWindow {
  if (filter.window !== 'custom') return windows[filter.window]
  if (!filter.start_date || !filter.end_date) {
    throw new Error('window "custom" requires both "start_date" and "end_date" (YYYY-MM-DD, inclusive)')
  }
  const tz = resolveTz(ctx.tz)
  const s = filter.start_date, e = filter.end_date
  const next = addDays(e.y, e.m, e.d, 1)
  const start = toDate(civilDateTimeToInstant(s.y, s.m, s.d, 0, 0, 0, tz))
  const end = toDate(civilDateTimeToInstant(next.y, next.m, next.d, 0, 0, 0, tz))
  if (end.getTime() <= start.getTime()) throw new Error('"end_date" must be on or after "start_date"')
  return { start, end }
}

function inWindow<T extends { transacted_at?: string | null }>(arr: readonly T[], w: DateWindow): T[] {
  if (!w || !(w.start instanceof Date) || !(w.end instanceof Date)) return []
  const startMs = w.start.getTime()
  const endMs = w.end.getTime()
  const out: T[] = []
  for (const item of arr) {
    if (!item || typeof item.transacted_at !== 'string') continue
    const t = new Date(item.transacted_at).getTime()
    if (Number.isFinite(t) && t >= startMs && t < endMs) out.push(item)
  }
  return out
}

// ─── Argument parsing ────────────────────────────────────────────────────
//
// Every tool argument is validated on the way in. A bad value throws with
// a message that names the field and the allowed values — the same
// self-correction loop the old sandbox's `{ error: "..." }` result gave
// the model (see askMurmur.ts's prompt: "read the error, fix it, call the
// tool again").

function parseWindowName(v: unknown): WindowName {
  if (typeof v === 'string' && (WINDOW_NAMES as readonly string[]).includes(v)) {
    return v as WindowName
  }
  throw new Error(`"window" must be one of ${WINDOW_NAMES.join(', ')}; got ${JSON.stringify(v)}`)
}

function parseDirection(v: unknown): 'debit' | 'credit' | undefined {
  if (v == null) return undefined
  if (v === 'debit' || v === 'credit') return v
  throw new Error(`"direction" must be "debit" or "credit"; got ${JSON.stringify(v)}`)
}

function parseOptionalString(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string' && v.trim()) return v.trim()
  return undefined
}

function parseLimit(v: unknown, fallback: number, max: number): number {
  if (v == null) return fallback
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, max)
}

// ─── Shared row filter ───────────────────────────────────────────────────

interface RowFilter {
  window: WindowName
  /** Only with window 'custom' — inclusive civil dates in the user's zone. */
  start_date?: { y: number; m: number; d: number }
  end_date?: { y: number; m: number; d: number }
  direction?: 'debit' | 'credit'
  category_name?: string
  merchant_contains?: string
  /** Rows that belong to this recurring rule (by the real link, then by
   *  name) — "which payments were 20 LLC?" (rule name, case-insensitive). */
  rule_name?: string
}

/** Rules whose name matches `needle` (case-insensitive, either contains). */
function rulesNamed(ctx: ToolContext, needle: string): AskMurmurRecurringRuleV2[] {
  const n = needle.trim().toLowerCase()
  return (ctx.recurring_rules as AskMurmurRecurringRuleV2[]).filter((r) => {
    const rn = (r.name ?? '').trim().toLowerCase()
    return !!rn && (rn === n || rn.includes(n) || n.includes(rn))
  })
}

/** Does `t` belong to `rule`? The persisted link wins; a name match only
 *  applies when the transaction carries no link at all. */
function txBelongsToRule(t: AskMurmurTransaction, rule: AskMurmurRecurringRuleV2): boolean {
  if (t.recurring_rule_id && rule.id) return t.recurring_rule_id === rule.id
  if (t.recurring_rule_id && !rule.id) return false
  const rn = (rule.name ?? '').trim().toLowerCase()
  const mn = (t.merchant ?? '').trim().toLowerCase()
  if (rn && mn && (mn.includes(rn) || rn.includes(mn))) return true
  return !!t.is_recurring && t.direction === rule.direction && Math.abs((t.amount_in_profile_currency ?? NaN) - rule.amount) < 0.005
}

interface FilteredRows {
  /** Rows in the window/filter whose FX snapshot has landed — the only
   *  rows any tool sums. */
  rows: AskMurmurTransaction[]
  /** Rows that matched the window/filter but have no
   *  `amount_in_profile_currency` yet — excluded from every total,
   *  never silently folded in as 0 (mirrors `summarize()`'s
   *  `pendingCount`, fix-plan 1.4). */
  pendingCount: number
}

function filterRows(
  ctx: ToolContext,
  windows: Record<WindowName, DateWindow>,
  filter: RowFilter,
): FilteredRows {
  let rows = inWindow(ctx.transactions ?? [], resolveWindow(filter, windows, ctx))
  if (filter.direction) rows = rows.filter((t) => t.direction === filter.direction)
  if (filter.category_name) {
    const target = filter.category_name.toLowerCase()
    rows = rows.filter((t) => (t.category_name ?? '').toLowerCase() === target)
  }
  if (filter.merchant_contains) {
    const needle = filter.merchant_contains.toLowerCase()
    rows = rows.filter((t) => (t.merchant ?? '').toLowerCase().includes(needle))
  }
  if (filter.rule_name) {
    const rules = rulesNamed(ctx, filter.rule_name)
    rows = rules.length === 0 ? [] : rows.filter((t) => rules.some((r) => txBelongsToRule(t, r)))
  }
  let pendingCount = 0
  const resolved: AskMurmurTransaction[] = []
  for (const t of rows) {
    if (t.amount_in_profile_currency == null) {
      pendingCount++
      continue
    }
    resolved.push(t)
  }
  return { rows: resolved, pendingCount }
}

function amountOf(t: AskMurmurTransaction): number {
  return t.amount_in_profile_currency as number
}

// ─── total ────────────────────────────────────────────────────────────────

interface TotalArgs extends RowFilter {}

function parseTotalArgs(args: Record<string, unknown>): TotalArgs {
  return {
    window: parseWindowName(args.window),
    start_date: parseCivilDate(args.start_date, 'start_date'),
    end_date: parseCivilDate(args.end_date, 'end_date'),
    direction: parseDirection(args.direction),
    category_name: parseOptionalString(args.category_name),
    merchant_contains: parseOptionalString(args.merchant_contains),
    rule_name: parseOptionalString(args.rule_name),
  }
}

/** How much of a requested window the data actually covers — so a
 *  "12-month average" over 8 days of history is impossible to state without
 *  seeing it (Aug 16: "$1,250 monthly average over the past 12 months" from
 *  one month of data). `days_with_data` counts civil days from the earliest
 *  transaction (or the window start, whichever is later) to the window end
 *  (or now); `months_covered` is that in months, rounded to one decimal. */
function coverageFor(ctx: ToolContext, w: DateWindow): { window_start: string; window_end: string; data_starts: string | null; days_with_data: number; months_covered: number; window_fully_covered: boolean } {
  const tz = resolveTz(ctx.tz)
  let earliest: number | null = null
  for (const t of ctx.transactions ?? []) {
    const ms = Date.parse(t.transacted_at)
    if (Number.isFinite(ms) && (earliest === null || ms < earliest)) earliest = ms
  }
  const nowMs = Date.parse(ctx.now_utc)
  const endMs = Math.min(w.end.getTime(), Number.isFinite(nowMs) ? nowMs : w.end.getTime())
  const startMs = earliest === null ? w.start.getTime() : Math.max(w.start.getTime(), earliest)
  const days = Math.max(0, Math.round((endMs - startMs) / 864e5))
  return {
    window_start: localDay(w.start.toISOString(), tz),
    window_end: localDay(new Date(Math.max(w.start.getTime(), endMs)).toISOString(), tz),
    data_starts: earliest === null ? null : localDay(new Date(earliest).toISOString(), tz),
    days_with_data: earliest === null ? 0 : days,
    months_covered: earliest === null ? 0 : Math.round((days / 30.44) * 10) / 10,
    window_fully_covered: earliest !== null && earliest <= w.start.getTime(),
  }
}

function totalTool(args: TotalArgs, ctx: ToolContext, windows: Record<WindowName, DateWindow>): unknown {
  const { rows, pendingCount } = filterRows(ctx, windows, args)
  const total = rows.reduce((acc, t) => acc + amountOf(t), 0)
  return {
    total: roundCents(total),
    count: rows.length,
    pending_conversion_count: pendingCount,
    coverage: coverageFor(ctx, resolveWindow(args, windows, ctx)),
  }
}

// ─── sum_by_category ────────────────────────────────────────────────────

interface SumByCategoryArgs extends Pick<RowFilter, 'window' | 'start_date' | 'end_date' | 'direction' | 'merchant_contains'> {}

function parseSumByCategoryArgs(args: Record<string, unknown>): SumByCategoryArgs {
  return {
    window: parseWindowName(args.window),
    start_date: parseCivilDate(args.start_date, 'start_date'),
    end_date: parseCivilDate(args.end_date, 'end_date'),
    direction: parseDirection(args.direction),
    merchant_contains: parseOptionalString(args.merchant_contains),
  }
}

function sumByCategoryTool(
  args: SumByCategoryArgs,
  ctx: ToolContext,
  windows: Record<WindowName, DateWindow>,
): unknown {
  const direction = args.direction ?? 'debit'
  const { rows, pendingCount } = filterRows(ctx, windows, { window: args.window, start_date: args.start_date, end_date: args.end_date, direction, merchant_contains: args.merchant_contains })
  const byCat = new Map<string, { total: number; count: number }>()
  for (const t of rows) {
    const key = t.category_name || 'Uncategorized'
    const bucket = byCat.get(key) ?? { total: 0, count: 0 }
    bucket.total += amountOf(t)
    bucket.count += 1
    byCat.set(key, bucket)
  }
  const categories = Array.from(byCat.entries())
    .map(([category_name, v]) => ({ category_name, total: roundCents(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total)
  return { categories, pending_conversion_count: pendingCount }
}

// ─── top_merchants ──────────────────────────────────────────────────────

interface TopMerchantsArgs {
  window: WindowName
  start_date?: RowFilter['start_date']
  end_date?: RowFilter['end_date']
  direction?: 'debit' | 'credit'
  category_name?: string
  merchant_contains?: string
  limit: number
}

function parseTopMerchantsArgs(args: Record<string, unknown>): TopMerchantsArgs {
  return {
    window: parseWindowName(args.window),
    start_date: parseCivilDate(args.start_date, 'start_date'),
    end_date: parseCivilDate(args.end_date, 'end_date'),
    direction: parseDirection(args.direction),
    category_name: parseOptionalString(args.category_name),
    merchant_contains: parseOptionalString(args.merchant_contains),
    limit: parseLimit(args.limit, 5, 20),
  }
}

function topMerchantsTool(
  args: TopMerchantsArgs,
  ctx: ToolContext,
  windows: Record<WindowName, DateWindow>,
): unknown {
  const direction = args.direction ?? 'debit'
  const { rows, pendingCount } = filterRows(ctx, windows, {
    window: args.window,
    start_date: args.start_date,
    end_date: args.end_date,
    direction,
    category_name: args.category_name,
    merchant_contains: args.merchant_contains,
  })
  const byMerchant = new Map<string, { total: number; count: number }>()
  for (const t of rows) {
    const key = t.merchant?.trim() || 'Unknown'
    const bucket = byMerchant.get(key) ?? { total: 0, count: 0 }
    bucket.total += amountOf(t)
    bucket.count += 1
    byMerchant.set(key, bucket)
  }
  const merchants = Array.from(byMerchant.entries())
    .map(([merchant, v]) => ({ merchant, total: roundCents(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, args.limit)
  return { merchants, pending_conversion_count: pendingCount }
}

// ─── series ─────────────────────────────────────────────────────────────

const SERIES_BUCKETS = ['day', 'week', 'month', 'weekday'] as const
type SeriesBucket = (typeof SERIES_BUCKETS)[number]

interface SeriesArgs extends Pick<RowFilter, 'window' | 'start_date' | 'end_date' | 'direction' | 'category_name' | 'merchant_contains'> {
  bucket: SeriesBucket
}

function parseSeriesArgs(args: Record<string, unknown>): SeriesArgs {
  const bucket = args.bucket
  if (typeof bucket !== 'string' || !(SERIES_BUCKETS as readonly string[]).includes(bucket)) {
    throw new Error(`"bucket" must be one of ${SERIES_BUCKETS.join(', ')}; got ${JSON.stringify(bucket)}`)
  }
  return {
    window: parseWindowName(args.window),
    start_date: parseCivilDate(args.start_date, 'start_date'),
    end_date: parseCivilDate(args.end_date, 'end_date'),
    bucket: bucket as SeriesBucket,
    direction: parseDirection(args.direction),
    category_name: parseOptionalString(args.category_name),
    merchant_contains: parseOptionalString(args.merchant_contains),
  }
}

function seriesTool(args: SeriesArgs, ctx: ToolContext, windows: Record<WindowName, DateWindow>): unknown {
  const direction = args.direction ?? 'debit'
  const tz = resolveTz(ctx.tz)
  const { rows, pendingCount } = filterRows(ctx, windows, { window: args.window, start_date: args.start_date, end_date: args.end_date, direction, category_name: args.category_name, merchant_contains: args.merchant_contains })

  const byBucket = new Map<string, { total: number; count: number; order: number }>()
  for (const t of rows) {
    let key: string
    let order: number
    if (args.bucket === 'day') {
      key = localDay(t.transacted_at, tz)
      order = Date.parse(`${key}T00:00:00Z`)
    } else if (args.bucket === 'week') {
      key = weekStart(t.transacted_at, tz)
      order = Date.parse(`${key}T00:00:00Z`)
    } else if (args.bucket === 'month') {
      key = monthIso(t.transacted_at, tz)
      order = Date.parse(`${key}-01T00:00:00Z`)
    } else {
      const parts = localParts(t.transacted_at, tz)
      key = String(parts.weekdayIndex)
      order = parts.weekdayIndex
    }
    const bucket = byBucket.get(key) ?? { total: 0, count: 0, order }
    bucket.total += amountOf(t)
    bucket.count += 1
    byBucket.set(key, bucket)
  }

  const weekdayLabelSet = args.bucket === 'weekday' ? weekdayLabels(ctx.locale, 'short') : null
  const points = Array.from(byBucket.entries())
    .map(([key, v]) => ({
      label: weekdayLabelSet ? weekdayLabelSet[Number(key)] : key,
      total: roundCents(v.total),
      count: v.count,
      order: v.order,
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...rest }) => rest)

  return { points, pending_conversion_count: pendingCount, coverage: coverageFor(ctx, resolveWindow(args, windows, ctx)) }
}

// ─── list_transactions ──────────────────────────────────────────────────
//
// The rows behind a figure. "I invested $450 this week" → "what were those
// exactly?" needs the individual transactions, which no aggregation tool
// can give. Newest first, capped, dates as civil days in the user's zone.

interface ListTransactionsArgs extends RowFilter {
  min_amount?: number
  limit: number
}

function parseListTransactionsArgs(args: Record<string, unknown>): ListTransactionsArgs {
  const minRaw = args.min_amount
  const min_amount = minRaw == null ? undefined : Number(minRaw)
  if (min_amount !== undefined && !Number.isFinite(min_amount)) {
    throw new Error(`"min_amount" must be a number; got ${JSON.stringify(minRaw)}`)
  }
  return {
    window: parseWindowName(args.window),
    start_date: parseCivilDate(args.start_date, 'start_date'),
    end_date: parseCivilDate(args.end_date, 'end_date'),
    direction: parseDirection(args.direction),
    category_name: parseOptionalString(args.category_name),
    merchant_contains: parseOptionalString(args.merchant_contains),
    rule_name: parseOptionalString(args.rule_name),
    min_amount,
    limit: parseLimit(args.limit, 12, 25),
  }
}

function listTransactionsTool(
  args: ListTransactionsArgs,
  ctx: ToolContext,
  windows: Record<WindowName, DateWindow>,
): unknown {
  const tz = resolveTz(ctx.tz)
  const { rows, pendingCount } = filterRows(ctx, windows, args)
  const matched = (args.min_amount !== undefined ? rows.filter((t) => amountOf(t) >= (args.min_amount as number)) : rows)
    .slice()
    .sort((a, b) => (a.transacted_at < b.transacted_at ? 1 : a.transacted_at > b.transacted_at ? -1 : 0))
  const total = roundCents(matched.reduce((acc, t) => acc + amountOf(t), 0))
  return {
    transactions: matched.slice(0, args.limit).map((t) => ({
      date: localDay(t.transacted_at, tz),
      merchant: t.merchant?.trim() || 'Unknown',
      amount: roundCents(amountOf(t)),
      direction: t.direction,
      category: t.category_name ?? null,
      recurring: !!t.is_recurring,
    })),
    count: matched.length,
    total,
    truncated: matched.length > args.limit,
    pending_conversion_count: pendingCount,
  }
}

// ─── recurring_in_window ────────────────────────────────────────────────
//
// The calendar answer to "how much will I earn / pay next month": every
// occurrence of every active rule inside the window, from the recurrence
// engine (same math as the Recurring screen and the Budgets tab). Aug 16:
// "next month ≈ $5,416.67" was the biweekly monthly-equivalent average;
// September actually has two paydays → $5,000.

function recurringInWindowTool(args: Record<string, unknown>, ctx: ToolContext, windows: Record<WindowName, DateWindow>): unknown {
  const filter: RowFilter = {
    window: parseWindowName(args.window),
    start_date: parseCivilDate(args.start_date, 'start_date'),
    end_date: parseCivilDate(args.end_date, 'end_date'),
  }
  const direction = parseDirection(args.direction)
  const w = resolveWindow(filter, windows, ctx)
  const tz = resolveTz(ctx.tz)
  const rules = (ctx.recurring_rules as AskMurmurRecurringRuleV2[]).filter(
    (r) => (!direction || r.direction === direction) && VALID_FREQUENCIES.has(r.frequency),
  )
  const perRule: Array<{ name: string; direction: string; amount: number; occurrences: number; dates: string[]; total: number; has_schedule: boolean }> = []
  let missingSchedule = 0
  for (const r of rules) {
    const name = r.name?.trim() || 'Unnamed'
    if (!r.starts_at) {
      missingSchedule += 1
      perRule.push({ name, direction: r.direction, amount: roundCents(r.amount), occurrences: 0, dates: [], total: 0, has_schedule: false })
      continue
    }
    try {
      const occ = occurrencesInWindow(
        {
          frequency: r.frequency as RecurringFrequency,
          interval: r.interval ?? 1,
          starts_at: r.starts_at,
          ends_at: r.ends_at ?? null,
          anchor_day: r.anchor_day ?? null,
          anchor_weekday: r.anchor_weekday ?? null,
          anchor_time: r.anchor_time ?? null,
        },
        w.start.toISOString(),
        w.end.toISOString(),
        tz,
        { limit: 400 },
      )
      perRule.push({ name, direction: r.direction, amount: roundCents(r.amount), occurrences: occ.length, dates: occ.map((o) => o.occurrenceDate), total: roundCents(occ.length * r.amount), has_schedule: true })
    } catch {
      missingSchedule += 1
      perRule.push({ name, direction: r.direction, amount: roundCents(r.amount), occurrences: 0, dates: [], total: 0, has_schedule: false })
    }
  }
  const sum = (d: 'debit' | 'credit') => roundCents(perRule.filter((p) => p.direction === d).reduce((a, p) => a + p.total, 0))
  return {
    window_start: localDay(w.start.toISOString(), tz),
    window_end_exclusive: localDay(w.end.toISOString(), tz),
    rules: perRule,
    expected_income_total: sum('credit'),
    expected_bills_total: sum('debit'),
    rules_without_schedule: missingSchedule,
  }
}

// ─── arith ──────────────────────────────────────────────────────────────
//
// One arithmetic step over figures the model already has (tool results,
// the overview, the budget block, the user's own numbers). "Is $450 a good
// ratio of what I make?" needs 450 ÷ 5416.67 — the model is not allowed to
// compute that in its head, so it asks; the validator then finds the
// result in the trusted set like any other tool figure.

const ARITH_OPS = ['add', 'subtract', 'multiply', 'divide', 'percent_of'] as const
type ArithOp = (typeof ARITH_OPS)[number]

function arithTool(args: Record<string, unknown>): unknown {
  const op = args.op
  if (typeof op !== 'string' || !(ARITH_OPS as readonly string[]).includes(op)) {
    throw new Error(`"op" must be one of ${ARITH_OPS.join(', ')}; got ${JSON.stringify(op)}`)
  }
  const a = Number(args.a)
  const b = Number(args.b)
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error('arith: "a" and "b" must both be numbers')
  }
  let result: number
  switch (op as ArithOp) {
    case 'add':
      result = a + b
      break
    case 'subtract':
      result = a - b
      break
    case 'multiply':
      result = a * b
      break
    case 'divide':
      if (b === 0) throw new Error('arith: cannot divide by zero')
      result = a / b
      break
    case 'percent_of':
      if (b === 0) throw new Error('arith: cannot take a percent of zero')
      result = (a / b) * 100
      break
  }
  return { op, a: round2(a), b: round2(b), result: round2(result) }
}

// ─── recurring_total ────────────────────────────────────────────────────

const VALID_FREQUENCIES: ReadonlySet<string> = new Set([
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
])

interface RecurringTotalArgs {
  direction?: 'debit' | 'credit'
}

function parseRecurringTotalArgs(args: Record<string, unknown>): RecurringTotalArgs {
  return { direction: parseDirection(args.direction) }
}

function recurringTotalTool(args: RecurringTotalArgs, ctx: ToolContext): unknown {
  const direction = args.direction ?? 'debit'
  const rules = (ctx.recurring_rules ?? []).filter(
    (r) => r.direction === direction && VALID_FREQUENCIES.has(r.frequency),
  )
  // Which of these rules has already produced a transaction THIS month —
  // deterministic, so an end-of-month forecast never counts a bill that
  // was charged on the 12th as "still upcoming" (the double-count the
  // prompt rule alone kept letting through). A rule is "paid this month"
  // when a same-direction transaction in the current month matches it by
  // name (either contains the other, case-insensitive) or is flagged
  // recurring with the same amount.
  const tz = resolveTz(ctx.tz)
  const windows = buildWindows(ctx.now_utc, tz)
  const thisMonthRows = filterRows(ctx, windows, { window: 'thisMonth', direction }).rows
  const matchesRule = (rule: AskMurmurRecurringRule, t: AskMurmurTransaction): boolean =>
    txBelongsToRule(t, rule as AskMurmurRecurringRuleV2)
  const normalized = rules
    .map((r) => {
      const paid = thisMonthRows.some((t) => matchesRule(r, t))
      return {
        name: r.name?.trim() || 'Unnamed',
        amount: roundCents(r.amount),
        frequency: r.frequency,
        monthly_amount: roundCents(
          monthlyEquivalent({ frequency: r.frequency as RecurringFrequency, interval: 1, amount: r.amount }),
        ),
        charged_this_month: paid,
      }
    })
    .sort((a, b) => b.monthly_amount - a.monthly_amount)
  const monthly_total = roundCents(normalized.reduce((acc, r) => acc + r.monthly_amount, 0))
  const still_due_this_month = normalized.filter((r) => !r.charged_this_month)
  const still_due_this_month_total = roundCents(still_due_this_month.reduce((acc, r) => acc + r.monthly_amount, 0))

  // Next occurrence per rule within 30 days — only for rules that carry
  // their recurrence fields (the rebuilt clients send them; an older client
  // gets an empty list, never a guess). "Netflix $14 due Aug 22".
  const horizonMs = Date.parse(ctx.now_utc) + 30 * 864e5
  const upcoming: Array<{ name: string; amount: number; due_date: string }> = []
  for (const r of rules) {
    const v2 = r as AskMurmurRecurringRuleV2
    if (!v2.starts_at) continue
    try {
      const occ = firstOccurrenceOnOrAfter(
        {
          frequency: v2.frequency as RecurringFrequency,
          interval: v2.interval ?? 1,
          starts_at: v2.starts_at,
          ends_at: v2.ends_at ?? null,
          anchor_day: v2.anchor_day ?? null,
          anchor_weekday: v2.anchor_weekday ?? null,
          anchor_time: v2.anchor_time ?? null,
        },
        ctx.now_utc,
        tz,
      )
      if (!occ || Date.parse(occ.instant) > horizonMs) continue
      upcoming.push({ name: r.name?.trim() || 'Unnamed', amount: roundCents(r.amount), due_date: occ.occurrenceDate })
    } catch {
      /* malformed rule — skip */
    }
  }
  upcoming.sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))

  return {
    rules: normalized,
    monthly_total,
    annual_total: roundCents(monthly_total * 12),
    // For "will I make it to the end of the month" / "what's left after
    // bills": only these are not yet in this month's spending total.
    still_due_this_month: still_due_this_month.map((r) => ({ name: r.name, monthly_amount: r.monthly_amount })),
    still_due_this_month_total,
    // Next 30 days, soonest first (civil dates in the user's zone).
    upcoming,
  }
}

// ─── can_afford ─────────────────────────────────────────────────────────
//
// The yes/no of an affordability question, decided deterministically.
// Aug 16 trace: with $1,584 left the model wrote "you wouldn't be able to
// afford a $1,200 laptop … leaving you $384" — right numbers, wrong verdict.
// The model passes what is available and what the item costs; the tool
// says whether it fits and what is left (or short).

function canAffordTool(args: Record<string, unknown>): unknown {
  const available = Number(args.available)
  const cost = Number(args.cost)
  if (!Number.isFinite(available) || !Number.isFinite(cost)) {
    throw new Error('can_afford: "available" and "cost" must both be numbers')
  }
  const left = round2(available - cost)
  return {
    available: round2(available),
    cost: round2(cost),
    fits: left >= 0,
    left_after: left >= 0 ? left : 0,
    shortfall: left < 0 ? round2(-left) : 0,
    verdict: left >= 0 ? 'fits' : 'does_not_fit',
  }
}

// ─── compare ────────────────────────────────────────────────────────────
//
// Structural comparison-direction guarantee. The model passes two values it
// computed via an earlier tool call; this tool returns which is greater.
// The validator then checks any "more X than Y" phrase in the verdict
// against this result.

interface ComparePayload {
  label: string
  value: number
}

function compareTool(args: { a: ComparePayload; b: ComparePayload }) {
  const a = args.a
  const b = args.b
  if (!a || typeof a.value !== 'number' || typeof a.label !== 'string') {
    throw new Error('compare: a must be { label: string, value: number }')
  }
  if (!b || typeof b.value !== 'number' || typeof b.label !== 'string') {
    throw new Error('compare: b must be { label: string, value: number }')
  }
  let direction: 'a_greater' | 'b_greater' | 'equal'
  if (Math.abs(a.value - b.value) < 0.005) direction = 'equal'
  else if (a.value > b.value) direction = 'a_greater'
  else direction = 'b_greater'
  return {
    a: { label: a.label, value: round2(a.value) },
    b: { label: b.label, value: round2(b.value) },
    direction,
    difference: round2(Math.abs(a.value - b.value)),
  }
}

// ─── Catalog (OpenAI function-calling format) ──────────────────────────

const WINDOW_ENUM_DESCRIPTION =
  'Named window (see the system prompt for the list), or "custom" with start_date + end_date for anything else (a named month, "the first week of July"). Prefer a named window when one matches exactly.'
const CUSTOM_DATE_PROPS = {
  start_date: { type: 'string', description: 'With window "custom": first day, inclusive, YYYY-MM-DD (user zone).' },
  end_date: { type: 'string', description: 'With window "custom": last day, inclusive, YYYY-MM-DD (user zone).' },
}

export const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'total',
      description:
        'Sum of transactions in a time window, in the user’s profile currency, optionally filtered by direction/category/merchant. Use for any single-number "how much" question.',
      parameters: {
        type: 'object',
        required: ['window'],
        properties: {
          window: { type: 'string', enum: WINDOW_NAMES, description: WINDOW_ENUM_DESCRIPTION },
          ...CUSTOM_DATE_PROPS,
          direction: {
            type: 'string',
            enum: ['debit', 'credit'],
            description: 'Omit for both. "debit" = spend, "credit" = income.',
          },
          category_name: {
            type: 'string',
            description: 'Exact category name to filter to, e.g. "Food & Dining".',
          },
          merchant_contains: {
            type: 'string',
            description: 'Case-insensitive substring match on merchant name, e.g. "starbucks".',
          },
          rule_name: { type: 'string', description: 'Only rows that belong to this recurring rule (by the stored link, then by name), e.g. "20 LLC". Use for "how much did <rule> pay me / cost me".' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'sum_by_category',
      description:
        'Per-category totals in a time window, sorted highest first. Use for "breakdown by category" / "biggest category" questions.',
      parameters: {
        type: 'object',
        required: ['window'],
        properties: {
          window: { type: 'string', enum: WINDOW_NAMES, description: WINDOW_ENUM_DESCRIPTION },
          ...CUSTOM_DATE_PROPS,
          direction: {
            type: 'string',
            enum: ['debit', 'credit'],
            description: 'Default "debit" (spend). Pass "credit" for an income breakdown.',
          },
          merchant_contains: {
            type: 'string',
            description: 'Case-insensitive substring match on merchant name, e.g. "coffee", "uber".',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'top_merchants',
      description:
        'Top merchants by total in a time window, sorted highest first. Use for "where do I spend the most" / "top merchants" questions.',
      parameters: {
        type: 'object',
        required: ['window'],
        properties: {
          window: { type: 'string', enum: WINDOW_NAMES, description: WINDOW_ENUM_DESCRIPTION },
          ...CUSTOM_DATE_PROPS,
          direction: { type: 'string', enum: ['debit', 'credit'], description: 'Default "debit".' },
          category_name: {
            type: 'string',
            description: 'Optional exact category name to narrow to, e.g. top merchants within "Food & Dining".',
          },
          merchant_contains: {
            type: 'string',
            description: 'Case-insensitive substring match on merchant name, e.g. "coffee", "uber".',
          },
          limit: { type: 'number', description: 'Max merchants to return, 1–20. Default 5.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'series',
      description:
        'A time series bucketed by day, week, month, or weekday within a window. Use for trend / "how has this changed" / "which day of the week" questions.',
      parameters: {
        type: 'object',
        required: ['window', 'bucket'],
        properties: {
          window: { type: 'string', enum: WINDOW_NAMES, description: WINDOW_ENUM_DESCRIPTION },
          ...CUSTOM_DATE_PROPS,
          bucket: {
            type: 'string',
            enum: SERIES_BUCKETS,
            description:
              'How to group points. "weekday" groups by Monday–Sunday regardless of date, for "which day do I spend most" questions.',
          },
          direction: { type: 'string', enum: ['debit', 'credit'], description: 'Default "debit".' },
          category_name: {
            type: 'string',
            description: 'Optional exact category name to trend, e.g. "Food & Dining".',
          },
          merchant_contains: {
            type: 'string',
            description: 'Optional case-insensitive merchant substring to trend, e.g. "uber".',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_transactions',
      description:
        'The individual transactions behind a figure — newest first, capped (default 12, max 25) — with `count` and `total` for the whole match. Use when the user wants to see the actual items ("what were those exactly?", "show me the transactions", "which ones?", "list my Uber rides").',
      parameters: {
        type: 'object',
        required: ['window'],
        properties: {
          window: { type: 'string', enum: WINDOW_NAMES, description: WINDOW_ENUM_DESCRIPTION },
          ...CUSTOM_DATE_PROPS,
          direction: { type: 'string', enum: ['debit', 'credit'], description: 'Omit for both. "debit" = spend, "credit" = income.' },
          category_name: { type: 'string', description: 'Exact category name to filter to.' },
          merchant_contains: { type: 'string', description: 'Case-insensitive substring match on merchant name.' },
          rule_name: { type: 'string', description: 'Only rows that belong to this recurring rule (stored link first, then name), e.g. "20 LLC" — the right way to list the payments behind a rule.' },
          min_amount: { type: 'number', description: 'Only rows at or above this amount (profile currency).' },
          limit: { type: 'number', description: 'Max rows to return, 1–25. Default 12.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'recurring_total',
      description:
        'Normalized monthly + annual total of the user’s active recurring rules (each rule’s frequency converted to its monthly-equivalent cost), plus the per-rule breakdown with `charged_this_month`, and `still_due_this_month_total` (rules that have NOT yet produced a transaction this month). Use for "how much do my subscriptions cost" / "recurring bills" questions — never estimate this from raw rule amounts yourself. For end-of-month forecasts use `still_due_this_month_total`, never `monthly_total` (bills already charged are already inside this month’s spending).',
      parameters: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['debit', 'credit'],
            description: 'Default "debit" (bills). Pass "credit" for recurring income like salary.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'recurring_in_window',
      description:
        'The CALENDAR projection of recurring rules inside a window: every occurrence (dates) of each active rule, expected_income_total and expected_bills_total. Use for "how much will I earn / pay next month (or this month, next 30 days, in September)" — this is the real answer; recurring_total.monthly_total is only the long-run monthly average.',
      parameters: {
        type: 'object',
        required: ['window'],
        properties: {
          window: { type: 'string', enum: WINDOW_NAMES, description: WINDOW_ENUM_DESCRIPTION },
          ...CUSTOM_DATE_PROPS,
          direction: { type: 'string', enum: ['debit', 'credit'], description: 'Omit for both.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'arith',
      description:
        'One arithmetic step over two numbers you already have (from a tool result, the data overview, the BUDGET block, or the user\'s message). You never do arithmetic yourself: a ratio ("is that a good share of what I make?" → percent_of), a difference ("how much more than last month?" → subtract), a per-day pace (divide), a projection (multiply) all go through this tool, and you quote the returned `result`.',
      parameters: {
        type: 'object',
        required: ['op', 'a', 'b'],
        properties: {
          op: { type: 'string', enum: ARITH_OPS, description: 'percent_of = a ÷ b × 100 ("a is what percent of b").' },
          a: { type: 'number' },
          b: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'can_afford',
      description:
        'Decides an affordability question. Pass what the user has available (e.g. income this month − spending this month − still_due_this_month_total, computed with the tools) and what the item costs; returns fits (true/false), left_after, shortfall and a verdict. Your yes/no MUST follow `verdict` — never decide affordability yourself.',
      parameters: {
        type: 'object',
        required: ['available', 'cost'],
        properties: {
          available: { type: 'number', description: 'Money available for the purchase, in the profile currency.' },
          cost: { type: 'number', description: 'Price of the item (the user\'s figure or your stated typical price).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compare',
      description: [
        'Determine which of two values is greater, equal, or smaller. Use this whenever your final verdict states "more A than B" / "higher than" / "less than" so the direction is structurally guaranteed correct.',
        'Pass values you computed via an earlier tool call. Each side is { label, value }.',
      ].join('\n'),
      parameters: {
        type: 'object',
        required: ['a', 'b'],
        properties: {
          a: {
            type: 'object',
            required: ['label', 'value'],
            properties: {
              label: { type: 'string', description: 'What this value represents, e.g. "Food & Dining (90d)"' },
              value: { type: 'number' },
            },
            additionalProperties: false,
          },
          b: {
            type: 'object',
            required: ['label', 'value'],
            properties: {
              label: { type: 'string' },
              value: { type: 'number' },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  },
]

// ─── Dispatch ───────────────────────────────────────────────────────────

export function resolveToolCall(
  name: string,
  args: unknown,
  ctx: ToolContext,
): { ok: true; result: unknown } | { ok: false; error: string } {
  try {
    const safeArgs = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
    const windows = buildWindows(ctx.now_utc, ctx.tz)

    // Reject arguments a tool doesn't understand instead of silently
    // ignoring them. Aug 15: the model called top_merchants with
    // merchant_contains "coffee" (a perfectly reasonable filter this tool
    // didn't accept), the filter was dropped, and an unfiltered top-5
    // (a handbag, a brokerage transfer) shipped under a "coffee" caption.
    // A named error here lets the model fix its call; silence lets it
    // mislabel.
    const allowed = TOOL_ARG_NAMES[name]
    if (allowed) {
      const unknown = Object.keys(safeArgs).filter((k) => !allowed.has(k))
      if (unknown.length > 0) {
        return {
          ok: false,
          error: `${name}: unknown argument(s) ${unknown.map((k) => JSON.stringify(k)).join(', ')}. Allowed: ${Array.from(allowed).join(', ')}.`,
        }
      }
    }

    let result: unknown
    switch (name) {
      case 'total':
        result = totalTool(parseTotalArgs(safeArgs), ctx, windows)
        break
      case 'sum_by_category':
        result = sumByCategoryTool(parseSumByCategoryArgs(safeArgs), ctx, windows)
        break
      case 'top_merchants':
        result = topMerchantsTool(parseTopMerchantsArgs(safeArgs), ctx, windows)
        break
      case 'series':
        result = seriesTool(parseSeriesArgs(safeArgs), ctx, windows)
        break
      case 'list_transactions':
        result = listTransactionsTool(parseListTransactionsArgs(safeArgs), ctx, windows)
        break
      case 'recurring_total':
        result = recurringTotalTool(parseRecurringTotalArgs(safeArgs), ctx)
        break
      case 'recurring_in_window':
        result = recurringInWindowTool(safeArgs, ctx, windows)
        break
      case 'arith':
        result = arithTool(safeArgs)
        break
      case 'can_afford':
        result = canAffordTool(safeArgs)
        break
      case 'compare':
        result = compareTool(safeArgs as unknown as { a: ComparePayload; b: ComparePayload })
        break
      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }

    // Round-trip through JSON to (1) verify the result is serializable and
    // (2) enforce the size cap — the same two guarantees the old sandbox's
    // `run_query` gave every result, minus the "drop prototype
    // shenanigans" clause, which no longer applies: there is no `raw`
    // value here that could carry one. Every result above is built from
    // plain object/array literals this function constructs itself.
    const json = JSON.stringify(result ?? null)
    if (json.length > MAX_TOOL_RESULT_BYTES) {
      return { ok: false, error: `${name}: result exceeds ${MAX_TOOL_RESULT_BYTES} bytes` }
    }
    return { ok: true, result: JSON.parse(json) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'tool failed' }
  }
}

// ─── Trusted-number extraction ──────────────────────────────────────────────
//
// Pulls every numeric value out of every successful tool-call result. The
// validator uses this set to confirm every figure in the model's final
// response came from a tool call (or from the user's own question, added
// separately).

export function trustedNumbersFromCalls(calls: ToolCallRecord[]): Set<number> {
  const out = new Set<number>([0, 100]) // refusal + "100% of..." always pass
  function walk(v: unknown) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.add(round2(v))
      out.add(Math.round(v))
    } else if (Array.isArray(v)) {
      for (const item of v) walk(item)
    } else if (v && typeof v === 'object') {
      for (const val of Object.values(v as Record<string, unknown>)) walk(val)
    }
  }
  for (const call of calls) {
    if (call.ok) walk(call.result)
  }
  return out
}

/** Returns every comparison result from the conversation so the validator
 *  can check verdict-comparison direction against ground truth. */
export function comparisonsFromCalls(
  calls: ToolCallRecord[],
): Array<{ a: ComparePayload; b: ComparePayload; direction: 'a_greater' | 'b_greater' | 'equal' }> {
  const out: Array<{ a: ComparePayload; b: ComparePayload; direction: 'a_greater' | 'b_greater' | 'equal' }> = []
  for (const c of calls) {
    if (!c.ok || c.name !== 'compare') continue
    const r = c.result as { a: ComparePayload; b: ComparePayload; direction: 'a_greater' | 'b_greater' | 'equal' }
    if (r && r.a && r.b && r.direction) out.push(r)
  }
  return out
}

// ─── Data overview ─────────────────────────────────────────────────────────────
//
// Deterministic, model-readable snapshot of the transaction set. Injected
// into the system prompt so the model has ground truth (count, date range,
// totals) before calling a single tool. When the model later gets an
// empty result for a windowed question, this overview is the receipt the
// retry-hint uses to call the model out: "you said no transactions this
// year, but the overview shows N transactions in 2026."
//
// `total_debit`/`total_credit`/`pending_conversion_count` route through
// `packages/shared/src/domain/money.ts`'s `summarize()` (fix-plan 1.4) so
// they agree with every other totals-rendering surface in the app instead
// of a raw `t.amount` sum. This is still computed from the (client-
// truncated, ≤ 90-day / ≤ 500-row) payload rather than a fresh database
// read — moving it server-side is a separate fix-plan 2.10 clause outside
// this pass's scope — so an account whose *only* activity in a window
// falls outside the payload still under-reports for that window.

export interface AskMurmurDataOverview {
  transaction_count: number
  earliest_transacted_at: string | null
  latest_transacted_at: string | null
  earliest_year: number | null
  latest_year: number | null
  debit_count: number
  credit_count: number
  total_debit: number
  total_credit: number
  /** Non-zero when some in-payload transactions are missing their FX
   *  snapshot (`amount_in_profile_currency` null) — those are excluded
   *  from `total_debit`/`total_credit` rather than silently counted as
   *  0, same rule `summarize()` applies everywhere else (fix-plan 1.4). */
  pending_conversion_count: number
  /** Pre-computed for the model so it doesn't have to discover empty
   *  windows by trial-and-error. */
  /** Spend / income inside the CURRENT calendar month (user's tz) — the
   *  figure to quote for "this month". `total_debit`/`total_credit` above
   *  span everything loaded (~90 days) and must never be labelled as a
   *  month. */
  this_month_debit: number
  this_month_credit: number
  has_transactions_this_year: boolean
  has_transactions_this_month: boolean
  has_transactions_last_month: boolean
  has_transactions_last_30_days: boolean
  has_transactions_last_90_days: boolean
  /** Distinct years in the data set, sorted ascending. Capped at 5 so
   *  the prompt stays compact. */
  years_present: number[]
  /** The user's own vocabulary — every category name in the data with its
   *  debit total, biggest first (≤ 30). Without this the model has to guess
   *  category names ("investments" vs the real "Savings & Investing") and
   *  answers "no transactions" from nothing (Aug 16 trace). */
  categories: Array<{ name: string; total: number; count: number }>
  /** Most frequent merchants (≤ 20) — same purpose, for merchant filters. */
  merchants: string[]
}

function toSummarizable(t: AskMurmurTransaction): SummarizableTransaction {
  return {
    amount_in_profile_currency: t.amount_in_profile_currency,
    direction: t.direction,
    transacted_at: t.transacted_at,
    category_name: t.category_name,
  }
}

export function buildDataOverview(ctx: ToolContext): AskMurmurDataOverview {
  const tz = resolveTz(ctx.tz)
  const txns = ctx.transactions ?? []
  if (txns.length === 0) {
    return {
      transaction_count: 0,
      earliest_transacted_at: null,
      latest_transacted_at: null,
      earliest_year: null,
      latest_year: null,
      debit_count: 0,
      credit_count: 0,
      total_debit: 0,
      total_credit: 0,
      this_month_debit: 0,
      this_month_credit: 0,
      pending_conversion_count: 0,
      has_transactions_this_year: false,
      has_transactions_this_month: false,
      has_transactions_last_month: false,
      has_transactions_last_30_days: false,
      has_transactions_last_90_days: false,
      years_present: [],
      categories: [],
      merchants: [],
    }
  }

  let earliest: string | null = null
  let latest: string | null = null
  let debitCount = 0
  let creditCount = 0
  const years = new Set<number>()

  for (const t of txns) {
    if (typeof t.transacted_at === 'string') {
      if (earliest === null || t.transacted_at < earliest) earliest = t.transacted_at
      if (latest === null || t.transacted_at > latest) latest = t.transacted_at
      years.add(localParts(t.transacted_at, tz).y)
    }
    if (t.direction === 'credit') creditCount += 1
    else debitCount += 1
  }

  // `expense`/`income` exclude transfer-kind categories (Savings &
  // Investing, by name-match) and use the FX-converted amount, same as
  // every other totals-rendering surface (fix-plan 1.4).
  const summary = summarize(txns.map(toSummarizable))

  const w = buildWindows(ctx.now_utc, tz)
  // Same aggregation as the `total` tool (every debit / credit row with a
  // resolved amount, transfers included) — so a figure the model quotes
  // from the overview and a figure it gets from `total` for the same
  // window can never disagree. (`summarize` above excludes transfer-kind
  // categories by design; mixing the two definitions inside one
  // conversation produced "$881" and "$1,331" for the same month.)
  const { rows: monthDebits } = filterRows(ctx, w, { window: 'thisMonth', direction: 'debit' })
  const { rows: monthCredits } = filterRows(ctx, w, { window: 'thisMonth', direction: 'credit' })
  const thisMonthDebit = roundCents(monthDebits.reduce((acc, t) => acc + amountOf(t), 0))
  const thisMonthCredit = roundCents(monthCredits.reduce((acc, t) => acc + amountOf(t), 0))

  const catAgg = new Map<string, { total: number; count: number }>()
  const merchantAgg = new Map<string, number>()
  for (const t of txns) {
    if (t.direction === 'debit') {
      const key = t.category_name || 'Uncategorized'
      const b = catAgg.get(key) ?? { total: 0, count: 0 }
      if (t.amount_in_profile_currency != null) b.total += t.amount_in_profile_currency
      b.count += 1
      catAgg.set(key, b)
    }
    const m = t.merchant?.trim()
    if (m) merchantAgg.set(m, (merchantAgg.get(m) ?? 0) + 1)
  }
  const categories = Array.from(catAgg.entries())
    .map(([name, v]) => ({ name, total: roundCents(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30)
  const merchants = Array.from(merchantAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name]) => name)
  return {
    transaction_count: txns.length,
    earliest_transacted_at: earliest,
    latest_transacted_at: latest,
    earliest_year: earliest ? localParts(earliest, tz).y : null,
    latest_year: latest ? localParts(latest, tz).y : null,
    debit_count: debitCount,
    credit_count: creditCount,
    total_debit: summary.expense,
    total_credit: summary.income,
    this_month_debit: thisMonthDebit,
    this_month_credit: thisMonthCredit,
    pending_conversion_count: summary.pendingCount,
    has_transactions_this_year: inWindow(txns, w.thisYear).length > 0,
    has_transactions_this_month: inWindow(txns, w.thisMonth).length > 0,
    has_transactions_last_month: inWindow(txns, w.lastMonth).length > 0,
    has_transactions_last_30_days: inWindow(txns, w.last30Days).length > 0,
    has_transactions_last_90_days: inWindow(txns, w.last90Days).length > 0,
    years_present: Array.from(years).sort((a, b) => a - b).slice(0, 5),
    categories,
    merchants,
  }
}

// ─── Summary snapshot for runSummarizeFallback ───────────────────────────
//
// Deterministic 6-month aggregation used by the summarize fallback when the
// primary tool-calling attempt produces an empty verdict. Computed inline so
// the fallback never depends on the OpenAI tool loop at all.
//
// Category/monthly totals below exclude transfer-kind categories (via
// `isSpend`) and use the FX-converted amount — fix-plan 1.4, same rule
// `buildDataOverview` applies.

export interface AskMurmurSummarySnapshot {
  top_categories_6m: Array<{ name: string; total: number }>
  monthly_series_6m: Array<{ label: string; spent: number }>
  transaction_count: number
  currency: string
  locale: string
}

export function buildSummarySnapshot(ctx: ToolContext): AskMurmurSummarySnapshot {
  const tz = resolveTz(ctx.tz)
  const windows = buildWindows(ctx.now_utc, tz)
  // Same definition of "spent" as the `total` tool and every app screen
  // (every debit with a resolved amount — transfers included): a fallback
  // answer must never disagree with the tool-grounded answers around it
  // (Aug 15: "$881" here vs "$1,331" from `total` for the same month).
  const recent = inWindow(ctx.transactions, windows.last6Months).filter(
    (t) => t.amount_in_profile_currency != null && t.direction === 'debit',
  )

  const byCat = new Map<string, number>()
  for (const t of recent) {
    const k = t.category_name || 'Uncategorized'
    byCat.set(k, (byCat.get(k) ?? 0) + amountOf(t))
  }
  const top_categories_6m = Array.from(byCat.entries())
    .map(([name, total]) => ({ name, total: roundCents(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  const monthly = new Map<string, number>()
  for (const t of recent) {
    const key = monthIso(t.transacted_at, tz)
    monthly.set(key, (monthly.get(key) ?? 0) + amountOf(t))
  }
  const monthly_series_6m = Array.from(monthly.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([label, spent]) => ({ label, spent: roundCents(spent) }))

  return {
    top_categories_6m,
    monthly_series_6m,
    transaction_count: ctx.transactions.length,
    currency: ctx.currency,
    locale: ctx.locale,
  }
}
