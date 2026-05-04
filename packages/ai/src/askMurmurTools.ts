// Tool-calling architecture for Ask Murmur \u2014 code execution edition.
//
// The model never does arithmetic. It writes JavaScript that runs in a
// sandboxed VM over the user's transactions and recurring rules; the
// sandbox returns deterministic JSON results which the model quotes
// verbatim in its final response. Every number in the response must trace
// back to either a query result or the user's own question; anything else
// is rejected by the validator.
//
// Two tools:
//   run_query \u2014 open-ended JS sandbox over the user's data. Covers any
//     numeric computation we couldn't predict in advance.
//   compare    \u2014 structural comparison of two values the model computed.
//     Forces the verdict's "more A than B" direction to be correct.
//
// Sandbox security: Node `vm.runInContext` with a hardened context (no
// `process`, no `require`, no `Function` constructor, no I/O, no network),
// 1s timeout, 50KB result size cap. The model is gpt-4o, not adversarial,
// so we trust intent and lock down capability. Upgrade path is
// `isolated-vm` (separate V8 isolate) if prompt-injection becomes a real
// threat.

import vm from 'node:vm'
import type {
  AskMurmurRecurringRule,
  AskMurmurTransaction,
} from '@voice-expense/shared'

const SANDBOX_TIMEOUT_MS = 1000
const MAX_CODE_LENGTH = 4000
const MAX_RESULT_BYTES = 50_000

export interface ToolContext {
  today: string
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

// ─── Date windows ────────────────────────────────────────────────────────────
//
// Pre-computed `{ start, end }` Date pairs the model can hand straight to
// `helpers.inWindow` without writing any date math. The model used to
// write `new Date(today).getMonth()` while `today` was a string — the
// query came back empty, the model reported "no expenses this month"
// even when one existed in the data. Removing the date math from the
// model's responsibility is the structural fix.

interface DateWindow { start: Date; end: Date }

function buildWindows(todayStr: string): Record<string, DateWindow> {
  const parsed = new Date(todayStr)
  const today = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()

  const startOfDay = (date: Date) => {
    const dd = new Date(date)
    dd.setHours(0, 0, 0, 0)
    return dd
  }

  const startOfToday = new Date(y, m, d, 0, 0, 0, 0)
  const endOfToday = new Date(y, m, d, 23, 59, 59, 999)

  const startOfThisMonth = new Date(y, m, 1, 0, 0, 0, 0)
  const endOfThisMonth = new Date(y, m + 1, 0, 23, 59, 59, 999)
  const startOfLastMonth = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const endOfLastMonth = new Date(y, m, 0, 23, 59, 59, 999)
  const startOfThisYear = new Date(y, 0, 1, 0, 0, 0, 0)
  const endOfThisYear = new Date(y, 11, 31, 23, 59, 59, 999)
  const startOfLastYear = new Date(y - 1, 0, 1, 0, 0, 0, 0)
  const endOfLastYear = new Date(y - 1, 11, 31, 23, 59, 59, 999)

  const last7 = startOfDay(new Date(endOfToday.getTime() - 6 * 86_400_000))
  const last30 = startOfDay(new Date(endOfToday.getTime() - 29 * 86_400_000))
  const last90 = startOfDay(new Date(endOfToday.getTime() - 89 * 86_400_000))
  const startOfLast6Months = new Date(y, m - 5, 1, 0, 0, 0, 0)
  const startOfLast12Months = new Date(y, m - 11, 1, 0, 0, 0, 0)

  return {
    today: { start: startOfToday, end: endOfToday },
    thisMonth: { start: startOfThisMonth, end: endOfThisMonth },
    lastMonth: { start: startOfLastMonth, end: endOfLastMonth },
    thisYear: { start: startOfThisYear, end: endOfThisYear },
    lastYear: { start: startOfLastYear, end: endOfLastYear },
    last7Days: { start: last7, end: endOfToday },
    last30Days: { start: last30, end: endOfToday },
    last90Days: { start: last90, end: endOfToday },
    last6Months: { start: startOfLast6Months, end: endOfToday },
    last12Months: { start: startOfLast12Months, end: endOfToday },
  }
}

function inWindow<T extends { transacted_at?: string | null }>(arr: T[], w: DateWindow): T[] {
  if (!w || !(w.start instanceof Date) || !(w.end instanceof Date)) return []
  const startMs = w.start.getTime()
  const endMs = w.end.getTime()
  const out: T[] = []
  for (const item of arr) {
    if (!item || typeof item.transacted_at !== 'string') continue
    const t = new Date(item.transacted_at).getTime()
    if (Number.isFinite(t) && t >= startMs && t <= endMs) out.push(item)
  }
  return out
}

// ─── Sandbox ─────────────────────────────────────────────────────────────────
//
// Hardened context. The model gets enough JS surface to filter / aggregate
// arrays but no door to side-effects.

function buildSandboxContext(ctx: ToolContext): vm.Context {
  const w = buildWindows(ctx.today)
  const txns = ctx.transactions ?? []
  // Pre-computed windowed subsets. These remove date math from the
  // model's responsibility entirely \u2014 it picks a variable instead of
  // writing a filter. Every common time window the model is likely to
  // need is here as a ready-made array. This is the structural fix for
  // the date-window bug class (model writes buggy date filter \u2192
  // returns 0 \u2192 reports "no expenses this period").
  const transactions_today = inWindow(txns, w.today)
  const transactions_this_month = inWindow(txns, w.thisMonth)
  const transactions_last_month = inWindow(txns, w.lastMonth)
  const transactions_this_year = inWindow(txns, w.thisYear)
  const transactions_last_year = inWindow(txns, w.lastYear)
  const transactions_last_7_days = inWindow(txns, w.last7Days)
  const transactions_last_30_days = inWindow(txns, w.last30Days)
  const transactions_last_90_days = inWindow(txns, w.last90Days)
  const transactions_last_6_months = inWindow(txns, w.last6Months)
  const transactions_last_12_months = inWindow(txns, w.last12Months)

  const sandbox: Record<string, unknown> = {
    // Data the model is reasoning over.
    transactions: ctx.transactions,
    recurring_rules: ctx.recurring_rules,
    today: ctx.today,
    currency: ctx.currency,
    locale: ctx.locale,
    monthly_income: ctx.monthly_income,
    // Pre-computed windowed subsets. The model uses these instead of
    // writing date filters. Every name maps directly to a windows.* key.
    transactions_today,
    transactions_this_month,
    transactions_last_month,
    transactions_this_year,
    transactions_last_year,
    transactions_last_7_days,
    transactions_last_30_days,
    transactions_last_90_days,
    transactions_last_6_months,
    transactions_last_12_months,
    // Pure stdlib the model needs for analytics. Anything not listed here is
    // not reachable from inside the sandbox.
    Math,
    Number,
    Date,
    Array,
    Object,
    String,
    Boolean,
    Map,
    Set,
    JSON,
    parseFloat,
    parseInt,
    isFinite,
    isNaN,
    // Pre-computed { start, end } Date windows. Mostly a fallback for
    // ad-hoc filtering \u2014 prefer the `transactions_*` subsets above
    // for any standard window. The model is told never to write date
    // math from `today` (which is a string).
    windows: w,
    // A few small helpers so common patterns don't bloat the model's code.
    helpers: {
      // Round to n decimal places (default 2). The model should round before
      // returning so the validator's quoted figure matches exactly.
      round: (v: number, decimals = 2) => {
        const m = Math.pow(10, decimals)
        return Math.round(v * m) / m
      },
      // Filter items by a pre-computed window. Use this instead of writing
      // date comparisons by hand.
      inWindow: (arr: unknown, win: DateWindow) => {
        if (!Array.isArray(arr)) return []
        return inWindow(arr as Array<{ transacted_at?: string | null }>, win)
      },
      // Inclusive day-window bounds (Date objects). Kept for back-compat
      // with prompts that still call it; prefer `windows.lastNDays`.
      windowDays: (n: number) => {
        const end = new Date()
        end.setHours(23, 59, 59, 999)
        const start = new Date(end.getTime() - (n - 1) * 86_400_000)
        start.setHours(0, 0, 0, 0)
        return { start, end }
      },
      // Sum a numeric field across an array.
      sumBy: <T,>(arr: T[], pick: (x: T) => number) =>
        arr.reduce((acc, x) => acc + (pick(x) || 0), 0),
      // Group an array by a key function. Returns Map<key, items[]>.
      groupBy: <T, K>(arr: T[], key: (x: T) => K) => {
        const m = new Map<K, T[]>()
        for (const x of arr) {
          const k = key(x)
          const list = m.get(k) ?? []
          list.push(x)
          m.set(k, list)
        }
        return m
      },
    },
    // No console: the sandbox shouldn't be doing I/O. `return` the result.
  }

  const context = vm.createContext(sandbox, {
    // Disable runtime code generation (eval, new Function) inside the
    // sandbox so the model can't construct an escape via eval-string-tricks.
    codeGeneration: { strings: false, wasm: false },
  })
  return context
}

// ─── run_query resolver ──────────────────────────────────────────────────────

function runQuery(args: { code: string; description?: string }, ctx: ToolContext): unknown {
  const code = typeof args.code === 'string' ? args.code : ''
  if (!code.trim()) throw new Error('run_query: code is empty')
  if (code.length > MAX_CODE_LENGTH) {
    throw new Error(`run_query: code exceeds ${MAX_CODE_LENGTH} chars`)
  }

  // Wrap the model's snippet in an IIFE so a `return` statement is valid at
  // the top level of the snippet. The model writes "return ..." style code.
  const wrapped = `(function () { 'use strict'; ${code} })()`

  const sandboxCtx = buildSandboxContext(ctx)
  let raw: unknown
  try {
    raw = vm.runInContext(wrapped, sandboxCtx, {
      timeout: SANDBOX_TIMEOUT_MS,
      displayErrors: false,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sandbox error'
    throw new Error(`run_query failed: ${message}`)
  }

  // Round-trip through JSON to (1) verify the result is serializable,
  // (2) enforce the size cap, (3) drop any prototype shenanigans before
  // returning to the caller.
  let json: string
  try {
    json = JSON.stringify(raw ?? null)
  } catch {
    throw new Error('run_query: result is not JSON-serializable')
  }
  if (json.length > MAX_RESULT_BYTES) {
    throw new Error(`run_query: result exceeds ${MAX_RESULT_BYTES} bytes`)
  }
  return JSON.parse(json)
}

// ─── compare resolver ────────────────────────────────────────────────────────
//
// Structural comparison-direction guarantee. The model passes two values it
// computed via run_query; this tool returns which is greater. The validator
// then checks any "more X than Y" phrase in the verdict against this result.

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

// ─── Catalog (OpenAI function-calling format) ────────────────────────────────

export const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'run_query',
      description: [
        "Run JavaScript over the user's transactions and recurring rules to compute any aggregate, filter, breakdown, or comparison.",
        'The code runs in a sandboxed VM. Inside the sandbox these variables are available:',
        '  transactions: Array<{ amount: number, direction: "debit" | "credit", merchant: string|null, category_name: string|null, transacted_at: ISO string, is_recurring: boolean }> \u2014 the FULL dataset, no date filter applied.',
        '',
        '  PRE-COMPUTED windowed subsets (use these for ANY question about a standard time window \u2014 NEVER write your own date filter for these):',
        '    transactions_today',
        '    transactions_this_month',
        '    transactions_last_month',
        '    transactions_this_year',
        '    transactions_last_year',
        '    transactions_last_7_days',
        '    transactions_last_30_days',
        '    transactions_last_90_days',
        '    transactions_last_6_months',
        '    transactions_last_12_months',
        '  Each is the same shape as `transactions`, already filtered to that window. So "this year\'s expenses by category" is `transactions_this_year`, not a filter you write.',
        '',
        '  recurring_rules: Array<{ name: string|null, amount: number, direction: "debit" | "credit", frequency: "daily"|"weekly"|"biweekly"|"monthly"|"quarterly"|"yearly" }>',
        '  today: ISO date string (display only \u2014 do NOT do date math from this string)',
        '  currency: e.g. "USD"',
        '  locale: e.g. "en"',
        '  monthly_income: number|null',
        '  windows: { start, end } Date pairs (today, thisMonth, lastMonth, thisYear, lastYear, last7Days, last30Days, last90Days, last6Months, last12Months) \u2014 fallback for ad-hoc filtering. Prefer the transactions_* subsets above whenever the question maps to one.',
        '  helpers: {',
        '    round(v, dec=2),',
        '    inWindow(items, window) \u2014 ad-hoc filter for a non-standard window only,',
        '    sumBy(arr, pick), groupBy(arr, key),',
        '    windowDays(n) \u2014 ad-hoc N-day window if windows.* doesn\'t cover what you need',
        '  }',
        'Plus core JS: Math, Number, Date, Array, Object, Map, Set, JSON, parseFloat, parseInt.',
        'Use a `return` statement to return the result. The result must be JSON-serializable.',
        'Use this for EVERY numeric computation \u2014 totals, filters, percentages, top-N, time series, anything. Never do arithmetic in the verdict yourself.',
      ].join('\n'),
      parameters: {
        type: 'object',
        required: ['code', 'description'],
        properties: {
          code: {
            type: 'string',
            description: 'JavaScript code with a return statement. Max 4000 chars. 1s timeout.',
          },
          description: {
            type: 'string',
            description: 'One-line summary of what this query computes (for logging).',
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
        'Pass values you computed via run_query. Each side is { label, value }.',
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

// ─── Dispatch ────────────────────────────────────────────────────────────────

export function resolveToolCall(
  name: string,
  args: unknown,
  ctx: ToolContext,
): { ok: true; result: unknown } | { ok: false; error: string } {
  try {
    const safeArgs = (args && typeof args === 'object' ? (args as Record<string, unknown>) : {})
    if (name === 'run_query') {
      return { ok: true, result: runQuery(safeArgs as { code: string; description?: string }, ctx) }
    }
    if (name === 'compare') {
      return { ok: true, result: compareTool(safeArgs as { a: ComparePayload; b: ComparePayload }) }
    }
    return { ok: false, error: `Unknown tool: ${name}` }
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

// ─── Data overview ───────────────────────────────────────────────────────────
//
// Deterministic, model-readable snapshot of the transaction set. Injected
// into the system prompt so the model has ground truth (count, date range,
// totals) before writing any query. When the model later writes a buggy
// date filter and gets 0 results, this overview is the receipt the
// retry-hint uses to call the model out: "you said no transactions this
// year, but the overview shows N transactions in 2026."

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

export function buildDataOverview(ctx: ToolContext): AskMurmurDataOverview {
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
  let totalDebit = 0
  let totalCredit = 0
  const years = new Set<number>()

  for (const t of txns) {
    if (typeof t.transacted_at === 'string') {
      if (earliest === null || t.transacted_at < earliest) earliest = t.transacted_at
      if (latest === null || t.transacted_at > latest) latest = t.transacted_at
      const d = new Date(t.transacted_at)
      if (!Number.isNaN(d.getTime())) years.add(d.getFullYear())
    }
    const amt = Number(t.amount) || 0
    if (t.direction === 'credit') {
      creditCount += 1
      totalCredit += amt
    } else {
      debitCount += 1
      totalDebit += amt
    }
  }

  const w = buildWindows(ctx.today)
  return {
    transaction_count: txns.length,
    earliest_transacted_at: earliest,
    latest_transacted_at: latest,
    earliest_year: earliest ? new Date(earliest).getFullYear() : null,
    latest_year: latest ? new Date(latest).getFullYear() : null,
    debit_count: debitCount,
    credit_count: creditCount,
    total_debit: round2(totalDebit),
    total_credit: round2(totalCredit),
    has_transactions_this_year: inWindow(txns, w.thisYear).length > 0,
    has_transactions_this_month: inWindow(txns, w.thisMonth).length > 0,
    has_transactions_last_month: inWindow(txns, w.lastMonth).length > 0,
    has_transactions_last_30_days: inWindow(txns, w.last30Days).length > 0,
    has_transactions_last_90_days: inWindow(txns, w.last90Days).length > 0,
    years_present: Array.from(years).sort((a, b) => a - b).slice(0, 5),
  }
}

// ─── Summary snapshot for runSummarizeFallback ───────────────────────────────
//
// Deterministic 6-month aggregation used by the summarize fallback when the
// primary tool-calling attempt produces an empty verdict. Computed inline so
// the fallback never depends on tools that aren't registered in
// `resolveToolCall` (a real bug in the previous shape — it called
// `top_categories` and `monthly_series` which don't exist, silently
// produced null snapshots, and the model had nothing to summarize).

export interface AskMurmurSummarySnapshot {
  top_categories_6m: Array<{ name: string; total: number }>
  monthly_series_6m: Array<{ label: string; spent: number }>
  transaction_count: number
  currency: string
  locale: string
}

export function buildSummarySnapshot(ctx: ToolContext): AskMurmurSummarySnapshot {
  const windows = buildWindows(ctx.today)
  const recent = inWindow(ctx.transactions, windows.last6Months).filter(
    (t) => t.direction === 'debit',
  )

  const byCat = new Map<string, number>()
  for (const t of recent) {
    const k = t.category_name || 'Uncategorized'
    byCat.set(k, (byCat.get(k) ?? 0) + (Number(t.amount) || 0))
  }
  const top_categories_6m = Array.from(byCat.entries())
    .map(([name, total]) => ({ name, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  const monthly = new Map<string, number>()
  for (const t of recent) {
    const dd = new Date(t.transacted_at)
    if (Number.isNaN(dd.getTime())) continue
    const key = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`
    monthly.set(key, (monthly.get(key) ?? 0) + (Number(t.amount) || 0))
  }
  const monthly_series_6m = Array.from(monthly.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([label, spent]) => ({ label, spent: round2(spent) }))

  return {
    top_categories_6m,
    monthly_series_6m,
    transaction_count: ctx.transactions.length,
    currency: ctx.currency,
    locale: ctx.locale,
  }
}
