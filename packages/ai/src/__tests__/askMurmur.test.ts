// End-to-end verification of the Ask Murmur sandbox + grounding logic.
//
// Ported from the standalone `askMurmur.verify.ts` script (audit 02-F27 /
// fix-plan item 1.1) into the vitest harness — same assertions, same
// synthetic dataset, now runnable via `npm test` / `turbo test` instead of
// a hand-run `npx tsx`. Runs without the OpenAI API: it drives
// `resolveToolCall` directly to prove the windowed subsets, the data
// overview, the locale-number parser, and the data-mismatch detector all
// behave correctly on a dataset shaped like a real user's data (April 2026
// transactions, today = May 3 2026).

import { describe, it, expect } from 'vitest'
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
import type { AskMurmurRequest, AskMurmurTransaction } from '@voice-expense/shared'

// ─── Synthetic dataset ──────────────────────────────────────────────────────
//
// Shaped to mirror a real user's data: April 2026 expenses plus a
// scattering of older transactions so every windowed subset can be proven
// sliced correctly.

const today = '2026-05-03'
const transactions: AskMurmurTransaction[] = [
  {
    amount: 55,
    direction: 'debit',
    merchant: 'Netflix',
    category_name: 'Subscriptions',
    transacted_at: '2026-04-19T18:46:00Z',
    is_recurring: true,
  },
  {
    amount: 20000,
    direction: 'debit',
    merchant: 'Housing',
    category_name: 'Housing',
    transacted_at: '2026-04-16T20:54:00Z',
    is_recurring: true,
  },
  {
    amount: 50,
    direction: 'debit',
    merchant: 'Starbucks',
    category_name: 'Food & Dining',
    transacted_at: '2026-04-14T02:30:00Z',
    is_recurring: false,
  },
  {
    amount: 20,
    direction: 'debit',
    merchant: 'Coffee',
    category_name: 'Food & Dining',
    transacted_at: '2026-04-11T09:00:00Z',
    is_recurring: false,
  },
  {
    amount: 5,
    direction: 'debit',
    merchant: 'Chick-fil-A',
    category_name: 'Food & Dining',
    transacted_at: '2026-03-15T12:00:00Z',
    is_recurring: false,
  },
  {
    amount: 50,
    direction: 'debit',
    merchant: "Domino's",
    category_name: 'Food & Dining',
    transacted_at: '2026-02-01T20:00:00Z',
    is_recurring: false,
  },
  {
    amount: 500,
    direction: 'debit',
    merchant: 'Christmas Gift',
    category_name: 'Gifts',
    transacted_at: '2025-12-25T00:00:00Z',
    is_recurring: false,
  },
  {
    amount: 30,
    direction: 'debit',
    merchant: 'Old Charge',
    category_name: 'Misc',
    transacted_at: '2024-11-01T00:00:00Z',
    is_recurring: false,
  },
]

const ctx: ToolContext = {
  today,
  currency: 'USD',
  monthly_income: 5000,
  locale: 'en',
  transactions,
  recurring_rules: [],
}

function runJs(code: string): unknown {
  const result = resolveToolCall('run_query', { code, description: 'verify' }, ctx)
  if (!result.ok) throw new Error(result.error)
  return result.result
}

describe('buildDataOverview', () => {
  const overview = buildDataOverview(ctx)

  it('transaction_count is 8', () => {
    expect(overview.transaction_count).toBe(8)
  })
  it('earliest is 2024-11-01, latest is 2026-04-19', () => {
    expect(overview.earliest_transacted_at?.startsWith('2024-11-01')).toBe(true)
    expect(overview.latest_transacted_at?.startsWith('2026-04-19')).toBe(true)
  })
  it('years_present is [2024, 2025, 2026]', () => {
    expect(overview.years_present).toEqual([2024, 2025, 2026])
  })
  it('has_transactions_this_year is true (April 2026 exists)', () => {
    expect(overview.has_transactions_this_year).toBe(true)
  })
  it('has_transactions_this_month is false (May 2026 is empty)', () => {
    expect(overview.has_transactions_this_month).toBe(false)
  })
  it('has_transactions_last_month is true (April 2026)', () => {
    expect(overview.has_transactions_last_month).toBe(true)
  })
  it('has_transactions_last_30_days is true (April 11/14/16/19)', () => {
    expect(overview.has_transactions_last_30_days).toBe(true)
  })
  it('has_transactions_last_90_days is true (Feb onwards)', () => {
    expect(overview.has_transactions_last_90_days).toBe(true)
  })
  it('total_debit equals sum of all debits', () => {
    const expected = transactions
      .filter((t) => t.direction === 'debit')
      .reduce((acc, t) => acc + t.amount, 0)
    expect(overview.total_debit).toBe(Math.round(expected * 100) / 100)
  })
})

describe('pre-computed transactions_* subsets via run_query', () => {
  it('transactions_this_year contains all 6 transactions in 2026', () => {
    expect(runJs('return transactions_this_year.length;')).toBe(6)
  })
  it('transactions_this_year debit total is 20180 (55+20000+50+20+5+50)', () => {
    const total = runJs(
      'return helpers.round(helpers.sumBy(transactions_this_year.filter(t => t.direction === "debit"), t => t.amount));',
    )
    expect(total).toBe(20180)
  })
  it('transactions_this_month is empty (May 2026 has no txns)', () => {
    expect(runJs('return transactions_this_month.length;')).toBe(0)
  })
  it('transactions_last_month has 4 (April 2026)', () => {
    expect(runJs('return transactions_last_month.length;')).toBe(4)
  })
  it('transactions_last_year has 1 (2025-12-25)', () => {
    expect(runJs('return transactions_last_year.length;')).toBe(1)
  })
  it('transactions_last_30_days has 4 (April 11/14/16/19)', () => {
    expect(runJs('return transactions_last_30_days.length;')).toBe(4)
  })
  it('transactions_last_90_days has 5 (window is Feb 3 – May 3, excludes Feb 1)', () => {
    // last_90_days is an inclusive 90-day window: today + 89 prior days.
    // From 2026-05-03 that starts at 2026-02-03, so the 2026-02-01 txn is
    // outside; April + March 2026 (5 txns) are inside.
    expect(runJs('return transactions_last_90_days.length;')).toBe(5)
  })
  it('transactions_last_6_months has 7 (incl. 2025-12-25)', () => {
    expect(runJs('return transactions_last_6_months.length;')).toBe(7)
  })
  it('transactions_last_12_months has 7 (May 3 2025 onwards)', () => {
    expect(runJs('return transactions_last_12_months.length;')).toBe(7)
  })
})

describe('end-to-end: "this year, by category" using transactions_this_year', () => {
  it('per-category breakdown of this year produces 3 categories', () => {
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
    // Debits in 2026: 4 in April + 1 March + 1 Feb, across 3 categories:
    // Housing (20000), Food & Dining (50+20+5+50=125), Subscriptions (55).
    expect(out.length).toBe(3)
    expect(out.find((r) => r.name === 'Housing')?.total).toBe(20000)
    expect(out.find((r) => r.name === 'Food & Dining')?.total).toBe(125)
    expect(out.find((r) => r.name === 'Subscriptions')?.total).toBe(55)
  })
})

describe('sandbox stays sealed', () => {
  it("require('fs') fails", () => {
    const r = resolveToolCall('run_query', { code: "return require('fs');", description: 'sec' }, ctx)
    expect(r.ok).toBe(false)
  })
  it('process is undefined', () => {
    const r = resolveToolCall('run_query', { code: 'return typeof process;', description: 'sec' }, ctx)
    expect(r.ok).toBe(true)
    expect(r.ok && r.result).toBe('undefined')
  })
  it('eval-like construction blocked (codeGeneration: false)', () => {
    const r = resolveToolCall(
      'run_query',
      { code: "return new Function('return 1')();", description: 'sec' },
      ctx,
    )
    expect(r.ok).toBe(false)
  })
})

describe('parseLocaleNumber via the validator on a fake response', () => {
  it('"$20,000" inside a verdict traces to a tool result of 20000', () => {
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
    expect(v.soft_issues).toEqual([])
  })

  it('"20,5" (single-digit tail) still parses as 20.5 decimal', () => {
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
    expect(v.soft_issues).toEqual([])
  })
})

describe('buildAskMurmurPrompt with overview', () => {
  it('prompt includes "DATA OVERVIEW" block and the pre-computed subset names', () => {
    const overview = buildDataOverview(ctx)
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
    expect(prompt).toMatch(/DATA OVERVIEW/)
    expect(prompt).toMatch(/transactions_this_year/)
    expect(prompt).toMatch(/transactions_last_30_days/)
  })
})

describe('validateAskMurmurResponse on a typical model output', () => {
  it('valid response is preserved verbatim', () => {
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
    expect(r.verdict.text.includes('$20,000')).toBe(true)
    expect(r.breakdown?.rows.length).toBe(3)
    expect(r.chart?.data.length).toBe(3)
  })
})

describe('TOOLS catalog', () => {
  it('exposes run_query and compare', () => {
    const names = TOOLS.map((t) => t.function.name).sort()
    expect(names).toEqual(['compare', 'run_query'])
  })

  it('run_query description mentions the pre-computed subsets', () => {
    const tool = TOOLS.find((t) => t.function.name === 'run_query')
    expect(tool).toBeTruthy()
    expect(tool!.function.description).toMatch(/transactions_this_year/)
    expect(tool!.function.description).toMatch(/transactions_last_30_days/)
  })
})

describe('buildSummarySnapshot', () => {
  it('returns top categories from last 6 months, Housing first', () => {
    const snap = buildSummarySnapshot(ctx)
    // Last 6 months = Nov 3 2025 onwards: 4 April + 1 March + 1 Feb 2026 + 1 Dec 2025 = 7 debits.
    expect(snap.top_categories_6m.length).toBeGreaterThan(0)
    expect(snap.top_categories_6m[0].name).toBe('Housing')
    expect(snap.top_categories_6m[0].total).toBe(20000)
  })
})
