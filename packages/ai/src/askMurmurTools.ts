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
// Six tools:
//   total            — sum over a window, optionally filtered by
//                       direction / category / merchant substring.
//   sum_by_category   — per-category totals over a window, sorted.
//   top_merchants     — ranked merchant totals over a window.
//   series            — a time series bucketed by day/week/month/weekday.
//   recurring_total   — normalized monthly/annual recurring commitment.
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
  AskMurmurTransaction,
  RecurringFrequency,
} from '@voice-expense/shared'
import {
  addDays,
  addMonthsClamped,
  civilDateTimeToInstant,
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
  recurring_rules: AskMurmurRecurringRule[]
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

export const WINDOW_NAMES = [
  'today',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'lastYear',
  'last7Days',
  'last30Days',
  'last90Days',
  'last6Months',
  'last12Months',
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

  return {
    today: dayWindow(y, m, d, resolvedTz),
    thisMonth: monthWindow(y, m, resolvedTz),
    lastMonth: monthWindow(prevMonth.y, prevMonth.m, resolvedTz),
    thisYear: yearWindow(y, resolvedTz),
    lastYear: yearWindow(y - 1, resolvedTz),
    last7Days: trailingDaysWindow(y, m, d, resolvedTz, 7),
    last30Days: trailingDaysWindow(y, m, d, resolvedTz, 30),
    last90Days: trailingDaysWindow(y, m, d, resolvedTz, 90),
    last6Months: monthsAgoWindow(y, m, d, resolvedTz, 5),
    last12Months: monthsAgoWindow(y, m, d, resolvedTz, 11),
  }
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
  direction?: 'debit' | 'credit'
  category_name?: string
  merchant_contains?: string
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
  let rows = inWindow(ctx.transactions ?? [], windows[filter.window])
  if (filter.direction) rows = rows.filter((t) => t.direction === filter.direction)
  if (filter.category_name) {
    const target = filter.category_name.toLowerCase()
    rows = rows.filter((t) => (t.category_name ?? '').toLowerCase() === target)
  }
  if (filter.merchant_contains) {
    const needle = filter.merchant_contains.toLowerCase()
    rows = rows.filter((t) => (t.merchant ?? '').toLowerCase().includes(needle))
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
    direction: parseDirection(args.direction),
    category_name: parseOptionalString(args.category_name),
    merchant_contains: parseOptionalString(args.merchant_contains),
  }
}

function totalTool(args: TotalArgs, ctx: ToolContext, windows: Record<WindowName, DateWindow>): unknown {
  const { rows, pendingCount } = filterRows(ctx, windows, args)
  const total = rows.reduce((acc, t) => acc + amountOf(t), 0)
  return {
    total: roundCents(total),
    count: rows.length,
    pending_conversion_count: pendingCount,
  }
}

// ─── sum_by_category ────────────────────────────────────────────────────

interface SumByCategoryArgs {
  window: WindowName
  direction?: 'debit' | 'credit'
}

function parseSumByCategoryArgs(args: Record<string, unknown>): SumByCategoryArgs {
  return { window: parseWindowName(args.window), direction: parseDirection(args.direction) }
}

function sumByCategoryTool(
  args: SumByCategoryArgs,
  ctx: ToolContext,
  windows: Record<WindowName, DateWindow>,
): unknown {
  const direction = args.direction ?? 'debit'
  const { rows, pendingCount } = filterRows(ctx, windows, { window: args.window, direction })
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
  direction?: 'debit' | 'credit'
  category_name?: string
  limit: number
}

function parseTopMerchantsArgs(args: Record<string, unknown>): TopMerchantsArgs {
  return {
    window: parseWindowName(args.window),
    direction: parseDirection(args.direction),
    category_name: parseOptionalString(args.category_name),
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
    direction,
    category_name: args.category_name,
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

interface SeriesArgs {
  window: WindowName
  bucket: SeriesBucket
  direction?: 'debit' | 'credit'
}

function parseSeriesArgs(args: Record<string, unknown>): SeriesArgs {
  const bucket = args.bucket
  if (typeof bucket !== 'string' || !(SERIES_BUCKETS as readonly string[]).includes(bucket)) {
    throw new Error(`"bucket" must be one of ${SERIES_BUCKETS.join(', ')}; got ${JSON.stringify(bucket)}`)
  }
  return {
    window: parseWindowName(args.window),
    bucket: bucket as SeriesBucket,
    direction: parseDirection(args.direction),
  }
}

function seriesTool(args: SeriesArgs, ctx: ToolContext, windows: Record<WindowName, DateWindow>): unknown {
  const direction = args.direction ?? 'debit'
  const tz = resolveTz(ctx.tz)
  const { rows, pendingCount } = filterRows(ctx, windows, { window: args.window, direction })

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

  return { points, pending_conversion_count: pendingCount }
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
  const normalized = rules
    .map((r) => ({
      name: r.name?.trim() || 'Unnamed',
      monthly_amount: roundCents(
        monthlyEquivalent({ frequency: r.frequency as RecurringFrequency, interval: 1, amount: r.amount }),
      ),
    }))
    .sort((a, b) => b.monthly_amount - a.monthly_amount)
  const monthly_total = roundCents(normalized.reduce((acc, r) => acc + r.monthly_amount, 0))
  return { rules: normalized, monthly_total, annual_total: roundCents(monthly_total * 12) }
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
  'One of: "today", "thisMonth", "lastMonth", "thisYear", "lastYear", "last7Days" (last 7 calendar days incl. today), "last30Days", "last90Days" (last quarter), "last6Months", "last12Months" (rolling last year). Always pick one of these — never compute your own date range.'

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
          direction: {
            type: 'string',
            enum: ['debit', 'credit'],
            description: 'Default "debit" (spend). Pass "credit" for an income breakdown.',
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
          direction: { type: 'string', enum: ['debit', 'credit'], description: 'Default "debit".' },
          category_name: {
            type: 'string',
            description: 'Optional exact category name to narrow to, e.g. top merchants within "Food & Dining".',
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
          bucket: {
            type: 'string',
            enum: SERIES_BUCKETS,
            description:
              'How to group points. "weekday" groups by Monday–Sunday regardless of date, for "which day do I spend most" questions.',
          },
          direction: { type: 'string', enum: ['debit', 'credit'], description: 'Default "debit".' },
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
        'Normalized monthly + annual total of the user’s active recurring rules (each rule’s frequency converted to its monthly-equivalent cost), plus the per-rule breakdown. Use for "how much do my subscriptions cost" / "recurring bills" questions — never estimate this from raw rule amounts yourself; a weekly rule’s monthly cost is not its raw amount.',
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
      case 'recurring_total':
        result = recurringTotalTool(parseRecurringTotalArgs(safeArgs), ctx)
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
  has_transactions_this_year: boolean
  has_transactions_this_month: boolean
  has_transactions_last_month: boolean
  has_transactions_last_30_days: boolean
  has_transactions_last_90_days: boolean
  /** Distinct years in the data set, sorted ascending. Capped at 5 so
   *  the prompt stays compact. */
  years_present: number[]
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
      pending_conversion_count: 0,
      has_transactions_this_year: false,
      has_transactions_this_month: false,
      has_transactions_last_month: false,
      has_transactions_last_30_days: false,
      has_transactions_last_90_days: false,
      years_present: [],
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
    pending_conversion_count: summary.pendingCount,
    has_transactions_this_year: inWindow(txns, w.thisYear).length > 0,
    has_transactions_this_month: inWindow(txns, w.thisMonth).length > 0,
    has_transactions_last_month: inWindow(txns, w.lastMonth).length > 0,
    has_transactions_last_30_days: inWindow(txns, w.last30Days).length > 0,
    has_transactions_last_90_days: inWindow(txns, w.last90Days).length > 0,
    years_present: Array.from(years).sort((a, b) => a - b).slice(0, 5),
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
  const recent = inWindow(ctx.transactions, windows.last6Months).filter(
    (t) => t.amount_in_profile_currency != null && isSpend(t, resolveCategoryKind(t.category_name, null)),
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
