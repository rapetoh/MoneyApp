// End-to-end verification of the Ask Murmur closed-toolset + grounding
// logic.
//
// Drives `resolveToolCall` directly to prove the tool catalog, the data
// overview, the locale-number parser, and the data-mismatch detector all
// behave correctly on a dataset shaped like a real user's data (April 2026
// transactions, "now" = May 3 2026 09:00 UTC in America/Chicago).

import { describe, it, expect } from 'vitest'
import {
  TOOLS,
  resolveToolCall,
  buildWindows,
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
// scattering of older transactions so every windowed tool can be proven
// sliced correctly. "Now" is 2026-05-03T14:00:00Z, which is 2026-05-03
// 09:00 in America/Chicago — the same civil day either way, so the
// pre-existing per-window assertions below (written against a bare date)
// still hold under the timezone-aware `now_utc`/`tz` contract.

const now_utc = '2026-05-03T14:00:00Z'
const tz = 'America/Chicago'
const transactions: AskMurmurTransaction[] = [
  {
    amount: 55,
    amount_in_profile_currency: 55,
    direction: 'debit',
    merchant: 'Netflix',
    category_name: 'Subscriptions',
    transacted_at: '2026-04-19T18:46:00Z',
    is_recurring: true,
  },
  {
    amount: 20000,
    amount_in_profile_currency: 20000,
    direction: 'debit',
    merchant: 'Housing',
    category_name: 'Housing',
    transacted_at: '2026-04-16T20:54:00Z',
    is_recurring: true,
  },
  {
    amount: 50,
    amount_in_profile_currency: 50,
    direction: 'debit',
    merchant: 'Starbucks',
    category_name: 'Food & Dining',
    transacted_at: '2026-04-14T02:30:00Z',
    is_recurring: false,
  },
  {
    amount: 20,
    amount_in_profile_currency: 20,
    direction: 'debit',
    merchant: 'Coffee',
    category_name: 'Food & Dining',
    transacted_at: '2026-04-11T09:00:00Z',
    is_recurring: false,
  },
  {
    amount: 5,
    amount_in_profile_currency: 5,
    direction: 'debit',
    merchant: 'Chick-fil-A',
    category_name: 'Food & Dining',
    transacted_at: '2026-03-15T12:00:00Z',
    is_recurring: false,
  },
  {
    amount: 50,
    amount_in_profile_currency: 50,
    direction: 'debit',
    merchant: "Domino's",
    category_name: 'Food & Dining',
    transacted_at: '2026-02-01T20:00:00Z',
    is_recurring: false,
  },
  {
    amount: 500,
    amount_in_profile_currency: 500,
    direction: 'debit',
    merchant: 'Christmas Gift',
    category_name: 'Gifts',
    transacted_at: '2025-12-25T00:00:00Z',
    is_recurring: false,
  },
  {
    amount: 30,
    amount_in_profile_currency: 30,
    direction: 'debit',
    merchant: 'Old Charge',
    category_name: 'Misc',
    transacted_at: '2024-11-01T00:00:00Z',
    is_recurring: false,
  },
]

const ctx: ToolContext = {
  now_utc,
  tz,
  currency: 'USD',
  monthly_income: 5000,
  locale: 'en',
  transactions,
  recurring_rules: [],
}

function call(name: string, args: Record<string, unknown>): unknown {
  const result = resolveToolCall(name, args, ctx)
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
      .reduce((acc, t) => acc + (t.amount_in_profile_currency ?? 0), 0)
    expect(overview.total_debit).toBe(Math.round(expected * 100) / 100)
  })
})

describe('tool: total', () => {
  it('thisYear debit total is 20180 (55+20000+50+20+5+50)', () => {
    expect(call('total', { window: 'thisYear', direction: 'debit' })).toMatchObject({
      total: 20180,
      count: 6,
    })
  })
  it('thisMonth is empty (May 2026 has no txns)', () => {
    expect(call('total', { window: 'thisMonth' })).toMatchObject({ total: 0, count: 0 })
  })
  it('lastMonth has 4 (April 2026)', () => {
    expect(call('total', { window: 'lastMonth' })).toMatchObject({ count: 4 })
  })
  it('lastYear has 1 (2025-12-25)', () => {
    expect(call('total', { window: 'lastYear' })).toMatchObject({ count: 1, total: 500 })
  })
  it('last30Days has 4 (April 11/14/16/19)', () => {
    expect(call('total', { window: 'last30Days' })).toMatchObject({ count: 4 })
  })
  it('last90Days has 5 (window excludes the 2026-02-01 txn)', () => {
    // last90Days is an inclusive 90-day window: today + 89 prior days.
    // From 2026-05-03 that starts at 2026-02-03, so the 2026-02-01 txn is
    // outside; April + March 2026 (5 txns) are inside.
    expect(call('total', { window: 'last90Days' })).toMatchObject({ count: 5 })
  })
  it('last6Months has 7 (incl. 2025-12-25)', () => {
    expect(call('total', { window: 'last6Months' })).toMatchObject({ count: 7 })
  })
  it('last12Months has 7 (May 3 2025 onwards)', () => {
    expect(call('total', { window: 'last12Months' })).toMatchObject({ count: 7 })
  })
  it('merchant_contains filters case-insensitively', () => {
    expect(call('total', { window: 'thisYear', merchant_contains: 'starbucks' })).toMatchObject({
      total: 50,
      count: 1,
    })
  })
  it('an invalid window throws a self-correcting error', () => {
    const r = resolveToolCall('total', { window: 'nextTuesday' }, ctx)
    expect(r.ok).toBe(false)
    expect(r.ok || r.error).toMatch(/window/)
  })
})

describe('tool: total — new named windows and custom ranges (Aug 15 gaps)', () => {
  // now = 2026-05-03 09:00 America/Chicago (a Sunday). ISO week = Mon Apr 27 – Sun May 3.
  it('yesterday is a single civil day (2026-05-02): none of the fixture rows', () => {
    expect(call('total', { window: 'yesterday' })).toMatchObject({ count: 0 })
  })
  it('thisWeek (Apr 27 – May 3) is empty; lastWeek (Apr 20 – 26) is empty; both resolve without throwing', () => {
    expect(call('total', { window: 'thisWeek' })).toMatchObject({ count: 0 })
    expect(call('total', { window: 'lastWeek' })).toMatchObject({ count: 0 })
  })
  it('thisQuarter (Apr–Jun 2026) has the 4 April rows; lastQuarter (Jan–Mar) has the March + Feb rows', () => {
    expect(call('total', { window: 'thisQuarter' })).toMatchObject({ count: 4 })
    expect(call('total', { window: 'lastQuarter' })).toMatchObject({ count: 2, total: 55 })
  })
  it('custom: "April 11–15" catches exactly the Apr 11 and Apr 14 rows', () => {
    expect(call('total', { window: 'custom', start_date: '2026-04-11', end_date: '2026-04-15' })).toMatchObject({ count: 2, total: 70 })
  })
  it('custom: a named month ("April") equals lastMonth', () => {
    expect(call('total', { window: 'custom', start_date: '2026-04-01', end_date: '2026-04-30' })).toEqual(call('total', { window: 'lastMonth' }))
  })
  it('custom without dates / with an impossible date / reversed range → self-correcting errors', () => {
    expect(resolveToolCall('total', { window: 'custom' }, ctx).ok).toBe(false)
    const bad = resolveToolCall('total', { window: 'custom', start_date: '2026-02-30', end_date: '2026-03-01' }, ctx)
    expect(bad.ok).toBe(false)
    expect(bad.ok || bad.error).toMatch(/calendar date/)
    const rev = resolveToolCall('total', { window: 'custom', start_date: '2026-04-15', end_date: '2026-04-11' }, ctx)
    expect(rev.ok).toBe(false)
  })
})

describe('tool: recurring_total — charged vs still due this month', () => {
  // now = 2026-05-03; Netflix's rule already produced a row this month? No —
  // the fixture's Netflix charge is 2026-04-19 (last month). Housing is
  // April too. So with rules for both, both are still due in May.
  const ctxWithRules: ToolContext = {
    ...ctx,
    recurring_rules: [
      { name: 'Netflix', amount: 55, direction: 'debit', frequency: 'monthly' },
      { name: 'Housing', amount: 20000, direction: 'debit', frequency: 'monthly' },
    ],
  }
  it('flags each rule and totals only the ones not yet charged this month', () => {
    const r = resolveToolCall('recurring_total', {}, ctxWithRules)
    expect(r.ok).toBe(true)
    const out = (r as { ok: true; result: any }).result
    expect(out.monthly_total).toBe(20055)
    expect(out.rules.every((x: any) => x.charged_this_month === false)).toBe(true)
    expect(out.still_due_this_month_total).toBe(20055)
  })
  it('a rule with a matching transaction this month is charged, not still due', () => {
    const c2: ToolContext = {
      ...ctxWithRules,
      transactions: [
        ...transactions,
        { amount: 55, amount_in_profile_currency: 55, direction: 'debit', merchant: 'Netflix', category_name: 'Subscriptions', transacted_at: '2026-05-02T12:00:00Z', is_recurring: true },
      ],
    }
    const out = (resolveToolCall('recurring_total', {}, c2) as { ok: true; result: any }).result
    const netflix = out.rules.find((x: any) => x.name === 'Netflix')
    expect(netflix.charged_this_month).toBe(true)
    expect(out.still_due_this_month_total).toBe(20000)
    expect(out.still_due_this_month.map((x: any) => x.name)).toEqual(['Housing'])
  })
})

describe('tool: sum_by_category', () => {
  it('this year, by category produces 3 categories', () => {
    const out = call('sum_by_category', { window: 'thisYear' }) as {
      categories: Array<{ category_name: string; total: number }>
    }
    // Debits in 2026: 4 in April + 1 March + 1 Feb, across 3 categories:
    // Housing (20000), Food & Dining (50+20+5+50=125), Subscriptions (55).
    expect(out.categories.length).toBe(3)
    expect(out.categories.find((r) => r.category_name === 'Housing')?.total).toBe(20000)
    expect(out.categories.find((r) => r.category_name === 'Food & Dining')?.total).toBe(125)
    expect(out.categories.find((r) => r.category_name === 'Subscriptions')?.total).toBe(55)
    // Sorted highest-first.
    expect(out.categories[0].category_name).toBe('Housing')
  })
})

describe('tool: top_merchants', () => {
  it('respects the limit and sorts highest first', () => {
    const out = call('top_merchants', { window: 'thisYear', limit: 2 }) as {
      merchants: Array<{ merchant: string; total: number }>
    }
    expect(out.merchants.length).toBe(2)
    expect(out.merchants[0].merchant).toBe('Housing')
  })
})

describe('tool: series', () => {
  it('buckets by month across last6Months', () => {
    const out = call('series', { window: 'last6Months', bucket: 'month' }) as {
      points: Array<{ label: string; total: number }>
    }
    const labels = out.points.map((p) => p.label)
    expect(labels).toContain('2026-04')
    expect(labels).toContain('2025-12')
    // Chronological order, not insertion order.
    expect(labels.indexOf('2025-12')).toBeLessThan(labels.indexOf('2026-04'))
  })
})

describe('tool: recurring_total', () => {
  it('normalizes a weekly rule to its monthly-equivalent cost, not its raw amount', () => {
    const weeklyCtx: ToolContext = {
      ...ctx,
      recurring_rules: [{ name: 'Cleaner', amount: 60, direction: 'debit', frequency: 'weekly' }],
    }
    const r = resolveToolCall('recurring_total', {}, weeklyCtx)
    expect(r.ok).toBe(true)
    const result = r.ok ? (r.result as { monthly_total: number }) : null
    // 60 * (52 / 12) = 260 — exact calendar ratio (was the 4.33 shortcut),
    // nowhere near the raw $60.
    expect(result?.monthly_total).toBeCloseTo(260, 1)
  })
})

describe('tool: compare', () => {
  it('reports a_greater / b_greater / equal correctly', () => {
    expect(call('compare', { a: { label: 'A', value: 10 }, b: { label: 'B', value: 5 } })).toMatchObject({
      direction: 'a_greater',
    })
    expect(call('compare', { a: { label: 'A', value: 5 }, b: { label: 'B', value: 10 } })).toMatchObject({
      direction: 'b_greater',
    })
  })
})

describe('TOOLS catalog', () => {
  it('exposes exactly the closed toolset — no run_query, no code execution', () => {
    const names = TOOLS.map((t) => t.function.name).sort()
    expect(names).toEqual([
      'compare',
      'recurring_total',
      'series',
      'sum_by_category',
      'top_merchants',
      'total',
    ])
    expect(names).not.toContain('run_query')
  })
})

describe('there is no code-execution surface (fix-plan 2.10 done-when)', () => {
  it('"run_query" is not a registered tool — a JS-injection attempt cannot even dispatch', () => {
    const r = resolveToolCall(
      'run_query',
      { code: "Object.prototype.pwned = 1; return 1;" },
      ctx,
    )
    expect(r.ok).toBe(false)
  })
  it('Object.prototype is untouched after every tool in the catalog has been called once', () => {
    for (const tool of TOOLS) {
      resolveToolCall(
        tool.function.name,
        { window: 'thisYear', bucket: 'month', a: { label: 'a', value: 1 }, b: { label: 'b', value: 2 } },
        ctx,
      )
    }
    // eslint-disable-next-line no-prototype-builtins -- the assertion IS the prototype check.
    expect(Object.prototype.hasOwnProperty('pwned')).toBe(false)
    expect((Object.prototype as unknown as Record<string, unknown>).pwned).toBeUndefined()
  })
})

describe('buildWindows — timezone-anchored window math (fix-plan 2.10 worked examples)', () => {
  it('now_utc=2026-09-01T01:00:00Z in America/Chicago resolves "today" to Aug 31', () => {
    const w = buildWindows('2026-09-01T01:00:00Z', 'America/Chicago')
    // Aug 31 00:00 America/Chicago (CDT, UTC-5) is 2026-08-31T05:00:00Z.
    expect(w.today.start.toISOString()).toBe('2026-08-31T05:00:00.000Z')
    expect(w.today.end.toISOString()).toBe('2026-09-01T05:00:00.000Z')
  })

  it('now_utc=2026-01-01T02:00:00Z in America/Chicago resolves "thisMonth" to December (year rollover)', () => {
    const w = buildWindows('2026-01-01T02:00:00Z', 'America/Chicago')
    // Jan 1 02:00 UTC is Dec 31 20:00 CST (UTC-6) — still December, and the
    // *previous* year. thisMonth must be December 2025, not January 2026.
    expect(w.thisMonth.start.toISOString()).toBe('2025-12-01T06:00:00.000Z')
    expect(w.thisMonth.end.toISOString()).toBe('2026-01-01T06:00:00.000Z')
  })

  it('an invalid IANA zone falls back to UTC instead of throwing', () => {
    expect(() => buildWindows('2026-05-03T12:00:00Z', 'Not/AZone')).not.toThrow()
    const w = buildWindows('2026-05-03T12:00:00Z', 'Not/AZone')
    expect(w.today.start.toISOString()).toBe('2026-05-03T00:00:00.000Z')
  })
})

describe('currency mixing (fix-plan 2.10 done-when)', () => {
  it('a USD 1000 debit + a EUR 50 debit (amount_in_profile_currency 54.20) sums to 1054.20, not 1050', () => {
    const mixedCtx: ToolContext = {
      now_utc,
      tz,
      currency: 'USD',
      monthly_income: null,
      locale: 'en',
      transactions: [
        {
          amount: 1000,
          amount_in_profile_currency: 1000,
          direction: 'debit',
          merchant: 'Rent',
          category_name: 'Housing',
          transacted_at: '2026-04-15T12:00:00Z',
          is_recurring: false,
        },
        {
          amount: 50,
          amount_in_profile_currency: 54.2,
          direction: 'debit',
          merchant: 'Restaurant',
          category_name: 'Food & Dining',
          transacted_at: '2026-04-16T12:00:00Z',
          is_recurring: false,
        },
      ],
      recurring_rules: [],
    }
    const overview = buildDataOverview(mixedCtx)
    expect(overview.total_debit).toBe(1054.2)

    const total = resolveToolCall('total', { window: 'lastMonth' }, mixedCtx)
    expect(total.ok).toBe(true)
    expect(total.ok && (total.result as { total: number }).total).toBe(1054.2)
  })

  it('a row missing its FX snapshot is excluded from the total and counted as pending, never treated as 0 or its raw amount', () => {
    const pendingCtx: ToolContext = {
      now_utc,
      tz,
      currency: 'USD',
      monthly_income: null,
      locale: 'en',
      transactions: [
        {
          amount: 100,
          amount_in_profile_currency: 100,
          direction: 'debit',
          merchant: 'A',
          category_name: 'Food & Dining',
          transacted_at: '2026-04-15T12:00:00Z',
          is_recurring: false,
        },
        {
          amount: 999,
          amount_in_profile_currency: null,
          direction: 'debit',
          merchant: 'B (awaiting FX)',
          category_name: 'Food & Dining',
          transacted_at: '2026-04-16T12:00:00Z',
          is_recurring: false,
        },
      ],
      recurring_rules: [],
    }
    const total = resolveToolCall('total', { window: 'lastMonth' }, pendingCtx)
    expect(total.ok).toBe(true)
    expect(total.ok && total.result).toMatchObject({ total: 100, count: 1, pending_conversion_count: 1 })
  })
})

describe('parseLocaleNumber via the validator on a fake response', () => {
  it('"$20,000" inside a verdict traces to a tool result of 20000', () => {
    const calls = [
      {
        name: 'total',
        args: { window: 'thisYear' },
        ok: true as const,
        result: { total: 20000, count: 1 },
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
        name: 'total',
        args: { window: 'last30Days' },
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
  it('prompt includes "DATA OVERVIEW", the tool names, and the resolved local date', () => {
    const overview = buildDataOverview(ctx)
    const req: AskMurmurRequest = {
      question: 'expenses this year by category',
      locale: 'en',
      currency: 'USD',
      now_utc,
      time_zone: tz,
      monthly_income: 5000,
      transactions,
      recurring_rules: [],
    }
    const prompt = buildAskMurmurPrompt(req, overview)
    expect(prompt).toMatch(/DATA OVERVIEW/)
    expect(prompt).toMatch(/sum_by_category/)
    expect(prompt).toMatch(/top_merchants/)
    // now_utc is 2026-05-03T14:00:00Z, which is still May 3 in Chicago.
    expect(prompt).toMatch(/Today's date: 2026-05-03/)
    expect(prompt).not.toMatch(/run_query/)
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

describe('buildSummarySnapshot', () => {
  it('returns top categories from last 6 months, Housing first', () => {
    const snap = buildSummarySnapshot(ctx)
    // Last 6 months = Nov 3 2025 onwards: 4 April + 1 March + 1 Feb 2026 + 1 Dec 2025 = 7 debits.
    expect(snap.top_categories_6m.length).toBeGreaterThan(0)
    expect(snap.top_categories_6m[0].name).toBe('Housing')
    expect(snap.top_categories_6m[0].total).toBe(20000)
  })
})
