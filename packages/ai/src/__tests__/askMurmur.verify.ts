/* eslint-disable no-console */
//
// End-to-end verification of the Ask Murmur sandbox + grounding logic.
// Runs without the OpenAI API \u2014 we drive `resolveToolCall` directly
// to prove the windowed subsets, the data overview, the locale-number
// parser, and the data-mismatch detector all behave correctly on a
// dataset shaped like the real user's data (April 2026 transactions,
// today = May 3 2026).
//
// Run:  npx tsx packages/ai/src/__tests__/askMurmur.verify.ts
//
// Exit code is non-zero on any failed assertion so CI / scripts can
// gate on it.

import { strict as assert } from 'node:assert'

import {
  TOOLS,
  resolveToolCall,
  buildDataOverview,
  buildSummarySnapshot,
  type ToolContext,
} from '../askMurmurTools'
import {
  buildAskMurmurPrompt,
  validateAskMurmurResponse,
  validateAskMurmurResponseAgainstCalls,
} from '../askMurmur'
import type {
  AskMurmurRequest,
  AskMurmurTransaction,
} from '@voice-expense/shared'

let failures = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  \u2713 ${name}`)
  } catch (err) {
    failures += 1
    console.log(`  \u2717 ${name}`)
    console.log(`      ${err instanceof Error ? err.message : String(err)}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

// ─── Synthetic dataset ──────────────────────────────────────────────────────
//
// Shaped to mirror the user's real data: April 2026 expenses plus a
// scattering of older transactions so we can prove every windowed
// subset is sliced correctly.

const today = '2026-05-03'
const transactions: AskMurmurTransaction[] = [
  { amount: 55, direction: 'debit', merchant: 'Netflix', category_name: 'Subscriptions', transacted_at: '2026-04-19T18:46:00Z', is_recurring: true },
  { amount: 20000, direction: 'debit', merchant: 'Housing', category_name: 'Housing', transacted_at: '2026-04-16T20:54:00Z', is_recurring: true },
  { amount: 50, direction: 'debit', merchant: 'Starbucks', category_name: 'Food & Dining', transacted_at: '2026-04-14T02:30:00Z', is_recurring: false },
  { amount: 20, direction: 'debit', merchant: 'Coffee', category_name: 'Food & Dining', transacted_at: '2026-04-11T09:00:00Z', is_recurring: false },
  { amount: 5,  direction: 'debit', merchant: 'Chick-fil-A', category_name: 'Food & Dining', transacted_at: '2026-03-15T12:00:00Z', is_recurring: false },
  { amount: 50, direction: 'debit', merchant: "Domino's", category_name: 'Food & Dining', transacted_at: '2026-02-01T20:00:00Z', is_recurring: false },
  { amount: 500, direction: 'debit', merchant: 'Christmas Gift', category_name: 'Gifts', transacted_at: '2025-12-25T00:00:00Z', is_recurring: false },
  { amount: 30, direction: 'debit', merchant: 'Old Charge', category_name: 'Misc', transacted_at: '2024-11-01T00:00:00Z', is_recurring: false },
]

const ctx: ToolContext = {
  today,
  currency: 'USD',
  monthly_income: 5000,
  locale: 'en',
  transactions,
  recurring_rules: [],
}

// ─── 1. Data overview ────────────────────────────────────────────────────────

section('1. buildDataOverview')

const overview = buildDataOverview(ctx)
console.log('   overview =', JSON.stringify(overview))

check('transaction_count is 8', () => {
  assert.equal(overview.transaction_count, 8)
})
check('earliest is 2024-11-01, latest is 2026-04-19', () => {
  assert.ok(overview.earliest_transacted_at?.startsWith('2024-11-01'))
  assert.ok(overview.latest_transacted_at?.startsWith('2026-04-19'))
})
check('years_present is [2024, 2025, 2026]', () => {
  assert.deepEqual(overview.years_present, [2024, 2025, 2026])
})
check('has_transactions_this_year is true (April 2026 exists)', () => {
  assert.equal(overview.has_transactions_this_year, true)
})
check('has_transactions_this_month is false (May 2026 is empty)', () => {
  assert.equal(overview.has_transactions_this_month, false)
})
check('has_transactions_last_month is true (April 2026)', () => {
  assert.equal(overview.has_transactions_last_month, true)
})
check('has_transactions_last_30_days is true (April 11/14/16/19)', () => {
  assert.equal(overview.has_transactions_last_30_days, true)
})
check('has_transactions_last_90_days is true (Feb onwards)', () => {
  assert.equal(overview.has_transactions_last_90_days, true)
})
check('total_debit equals sum of all debits', () => {
  const expected = transactions
    .filter((t) => t.direction === 'debit')
    .reduce((acc, t) => acc + t.amount, 0)
  assert.equal(overview.total_debit, Math.round(expected * 100) / 100)
})

// ─── 2. Pre-computed sandbox subsets ─────────────────────────────────────────

section('2. Pre-computed transactions_* subsets via run_query')

function runJs(code: string): unknown {
  const result = resolveToolCall('run_query', { code, description: 'verify' }, ctx)
  if (!result.ok) throw new Error(result.error)
  return result.result
}

check('transactions_this_year contains all 6 transactions in 2026', () => {
  const count = runJs('return transactions_this_year.length;') as number
  assert.equal(count, 6, `expected 6, got ${count}`)
})
check('transactions_this_year sums to 20130 (55+20000+50+20+5)+50=20180? recompute', () => {
  const total = runJs(
    'return helpers.round(helpers.sumBy(transactions_this_year.filter(t => t.direction === "debit"), t => t.amount));',
  ) as number
  // 55 + 20000 + 50 + 20 + 5 + 50 = 20180
  assert.equal(total, 20180, `expected 20180, got ${total}`)
})
check('transactions_this_month is empty (May 2026 has no txns)', () => {
  const count = runJs('return transactions_this_month.length;') as number
  assert.equal(count, 0, `expected 0, got ${count}`)
})
check('transactions_last_month has 4 (April 2026)', () => {
  const count = runJs('return transactions_last_month.length;') as number
  assert.equal(count, 4, `expected 4, got ${count}`)
})
check('transactions_last_year has 1 (2025-12-25)', () => {
  const count = runJs('return transactions_last_year.length;') as number
  assert.equal(count, 1, `expected 1, got ${count}`)
})
check('transactions_last_30_days has 4 (April 11/14/16/19)', () => {
  const count = runJs('return transactions_last_30_days.length;') as number
  assert.equal(count, 4, `expected 4, got ${count}`)
})
check('transactions_last_90_days has 5 (window is Feb 3 \u2014 May 3, excludes Feb 1)', () => {
  // last_90_days is an inclusive 90-day window: today + 89 prior days.
  // From 2026-05-03 that starts at 2026-02-03, so the 2026-02-01 txn is
  // outside; April + March 2026 (5 txns) are inside.
  const count = runJs('return transactions_last_90_days.length;') as number
  assert.equal(count, 5, `expected 5, got ${count}`)
})
check('transactions_last_6_months has 7 (incl. 2025-12-25)', () => {
  const count = runJs('return transactions_last_6_months.length;') as number
  assert.equal(count, 7, `expected 7, got ${count}`)
})
check('transactions_last_12_months has 7 (May 3 2025 onwards)', () => {
  const count = runJs('return transactions_last_12_months.length;') as number
  assert.equal(count, 7, `expected 7, got ${count}`)
})

// ─── 3. Per-category aggregation \u2014 the user's actual question ──────────

section('3. End-to-end: "this year, by category" using transactions_this_year')

check('Per-category breakdown of this year produces 4 categories', () => {
  const out = runJs(`
    const by = helpers.groupBy(
      transactions_this_year.filter(t => t.direction === 'debit'),
      t => t.category_name || 'Uncategorized',
    );
    const rows = [];
    for (const [name, items] of by) {
      rows.push({ name, total: helpers.round(helpers.sumBy(items, t => t.amount)) });
    }
    return rows.sort((a, b) => b.total - a.total);
  `) as Array<{ name: string; total: number }>
  // Expected: Housing 20000, Food & Dining 125 (50+20+5+50), Subscriptions 55
  // = 3 categories. Wait, only debits in 2026: 4 in April + 1 March + 1 Feb,
  // categories: Subscriptions (55), Housing (20000), Food & Dining (50+20+5+50=125)
  assert.equal(out.length, 3)
  const housing = out.find((r) => r.name === 'Housing')
  const food = out.find((r) => r.name === 'Food & Dining')
  const subs = out.find((r) => r.name === 'Subscriptions')
  assert.equal(housing?.total, 20000)
  assert.equal(food?.total, 125)
  assert.equal(subs?.total, 55)
})

// ─── 4. Sandbox security ─────────────────────────────────────────────────────

section('4. Sandbox stays sealed')

check("require('fs') fails", () => {
  const r = resolveToolCall('run_query', { code: "return require('fs');", description: 'sec' }, ctx)
  assert.equal(r.ok, false)
})
check('process is undefined', () => {
  const r = resolveToolCall('run_query', { code: 'return typeof process;', description: 'sec' }, ctx)
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.result, 'undefined')
})
check('eval-like construction blocked (codeGeneration: false)', () => {
  const r = resolveToolCall('run_query', { code: "return new Function('return 1')();", description: 'sec' }, ctx)
  assert.equal(r.ok, false)
})

// ─── 5. parseLocaleNumber via the validator on a fake response ──────────────

section('5. parseLocaleNumber: $20,000 must parse as 20000')

check('"$20,000" inside a verdict traces to a tool result of 20000', () => {
  const calls = [
    {
      name: 'run_query',
      args: { code: 'noop', description: 'noop' },
      ok: true as const,
      result: { total_spent: 20000 },
    },
  ]
  const response = {
    verdict: { text: 'You spent <b>$20,000</b> on housing this year.', sentiment: 'neutral' as const },
    actions: [],
    attribution: { transaction_count: 8 },
    out_of_scope: false,
  }
  const v = validateAskMurmurResponseAgainstCalls(response, calls, 'how much on housing this year', null)
  assert.equal(
    v.soft_issues.length,
    0,
    `expected no soft issues, got: ${v.soft_issues.join(' | ')}`,
  )
})

check('"20,5" (single-digit tail) still parses as 20.5 decimal', () => {
  // Drive through the validator's tracer.
  const calls = [
    {
      name: 'run_query',
      args: { code: 'noop', description: 'noop' },
      ok: true as const,
      result: { value: 20.5 },
    },
  ]
  const response = {
    verdict: { text: 'You averaged 20,5 per day.', sentiment: 'neutral' as const },
    actions: [],
    attribution: { transaction_count: 8 },
    out_of_scope: false,
  }
  const v = validateAskMurmurResponseAgainstCalls(response, calls, 'average per day', null)
  assert.equal(v.soft_issues.length, 0, `expected no soft issues, got: ${v.soft_issues.join(' | ')}`)
})

// ─── 6. Prompt + validator wiring ────────────────────────────────────────────

section('6. buildAskMurmurPrompt with overview')

check('Prompt includes "DATA OVERVIEW" block and the pre-computed subset names', () => {
  const req: AskMurmurRequest = {
    question: 'expenses this year by category',
    locale: 'en',
    currency: 'USD',
    today,
    monthly_income: 5000,
    transactions,
    recurring_rules: [],
  }
  const prompt = buildAskMurmurPrompt(req, overview)
  assert.match(prompt, /DATA OVERVIEW/)
  assert.match(prompt, /transactions_this_year/)
  assert.match(prompt, /transactions_last_30_days/)
})

// ─── 7. Validator shape \u2014 happy-path response renders cleanly ──────────

section('7. validateAskMurmurResponse on a typical model output')

check('Valid response is preserved verbatim', () => {
  const raw = {
    verdict: { text: 'Housing dominates your year at <b>$20,000</b>.', sentiment: 'neutral' },
    breakdown: {
      caption: 'This year so far',
      rows: [
        { label: 'Housing', value: '$20,000' },
        { label: 'Food & Dining', value: '$125' },
        { label: 'Subscriptions', value: '$55' },
      ],
    },
    chart: {
      type: 'donut',
      title: 'This year by category',
      data: [
        { label: 'Housing', value: 20000 },
        { label: 'Food & Dining', value: 125 },
        { label: 'Subscriptions', value: 55 },
      ],
    },
    attribution: { transaction_count: 8 },
    actions: [],
    out_of_scope: false,
  }
  const r = validateAskMurmurResponse(raw, 8)
  assert.equal(r.verdict.text.includes('$20,000'), true)
  assert.equal(r.breakdown?.rows.length, 3)
  assert.equal(r.chart?.data.length, 3)
})

// ─── 8. TOOLS catalog wiring ─────────────────────────────────────────────────

section('8. TOOLS catalog')

check('TOOLS exposes run_query and compare', () => {
  const names = TOOLS.map((t) => t.function.name).sort()
  assert.deepEqual(names, ['compare', 'run_query'])
})

check('run_query description mentions the pre-computed subsets', () => {
  const tool = TOOLS.find((t) => t.function.name === 'run_query')
  assert.ok(tool)
  assert.match(tool!.function.description, /transactions_this_year/)
  assert.match(tool!.function.description, /transactions_last_30_days/)
})

// ─── 9. Summary snapshot used by the fallback path ──────────────────────────

section('9. buildSummarySnapshot')

check('Summary snapshot returns top categories from last 6 months', () => {
  const snap = buildSummarySnapshot(ctx)
  // Last 6 months = Nov 3 2025 onwards: 4 April + 1 March + 1 Feb 2026 + 1 Dec 2025 = 7 debits.
  assert.ok(snap.top_categories_6m.length > 0)
  // Housing is the biggest by far.
  assert.equal(snap.top_categories_6m[0].name, 'Housing')
  assert.equal(snap.top_categories_6m[0].total, 20000)
})

// ─── Result ──────────────────────────────────────────────────────────────────

console.log('')
if (failures === 0) {
  console.log('All checks passed.')
  process.exit(0)
} else {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
