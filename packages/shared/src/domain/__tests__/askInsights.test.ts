import { describe, it, expect } from 'vitest'
import { computeAskInsights, type AskInsightRule } from '../askInsights'
import type { AskMurmurTransaction, AskMurmurBudget } from '../../types/ai'

// Aug 16 2026, 10:00 Chicago. Fixture shaped like the owner's own account.
const NOW = '2026-08-16T15:00:00Z'
const TZ = 'America/Chicago'

function tx(
  amount: number,
  merchant: string,
  category_name: string,
  iso: string,
  direction: 'debit' | 'credit' = 'debit',
  is_recurring = false,
): AskMurmurTransaction {
  return { amount, amount_in_profile_currency: amount, direction, merchant, category_name, transacted_at: iso, is_recurring }
}

const base = {
  now_utc: NOW,
  time_zone: TZ,
  currency: 'USD',
  locale: 'en' as const,
  monthly_income: 5416.67,
  budget: null as AskMurmurBudget | null,
}

const groceriesPriorMonths: AskMurmurTransaction[] = [
  // Groceries by the 16th in May / June / July: ~$100 each month.
  tx(50, 'Whole Foods', 'Groceries', '2026-05-04T17:00:00Z'),
  tx(52, "Trader Joe's", 'Groceries', '2026-05-12T17:00:00Z'),
  tx(48, 'Whole Foods', 'Groceries', '2026-06-03T17:00:00Z'),
  tx(55, "Trader Joe's", 'Groceries', '2026-06-14T17:00:00Z'),
  tx(49, 'Whole Foods', 'Groceries', '2026-07-05T17:00:00Z'),
  tx(51, "Trader Joe's", 'Groceries', '2026-07-13T17:00:00Z'),
  // and a bit later in each month (should NOT count for "by this point")
  tx(90, 'Costco', 'Groceries', '2026-07-28T17:00:00Z'),
]

const thisMonth: AskMurmurTransaction[] = [
  tx(2500, 'The20', 'Business & Work', '2026-08-01T14:00:00Z', 'credit', true),
  tx(120, 'Whole Foods', 'Groceries', '2026-08-03T17:00:00Z'),
  tx(95, "Trader Joe's", 'Groceries', '2026-08-09T17:00:00Z'),
  tx(88, 'Costco', 'Groceries', '2026-08-14T17:00:00Z'),
  tx(42, 'Xtream', 'Utilities', '2026-08-03T12:00:00Z', 'debit', true),
  tx(300, 'Charles Schwab', 'Savings & Investing', '2026-08-03T12:00:00Z', 'debit', true),
  tx(500, 'Louis Vuitton', 'Shopping', '2026-08-15T18:00:00Z'),
  tx(12, 'Starbucks', 'Food & Dining', '2026-08-10T13:00:00Z'),
  tx(9, 'Starbucks', 'Food & Dining', '2026-08-11T13:00:00Z'),
  tx(14, 'Chipotle', 'Food & Dining', '2026-08-12T18:00:00Z'),
  tx(28, 'Uber', 'Transportation', '2026-08-13T22:00:00Z'),
  tx(15, 'Walmart', 'Shopping', '2026-08-13T22:00:00Z'),
]

const rules: AskInsightRule[] = [
  { name: 'Netflix', amount: 14, direction: 'debit', frequency: 'monthly', interval: 1, starts_at: '2026-01-22T12:00:00Z', ends_at: null, is_active: true },
  { name: 'Xtream', amount: 42, direction: 'debit', frequency: 'monthly', interval: 1, starts_at: '2026-01-03T12:00:00Z', ends_at: null, is_active: true },
  { name: 'Charles Schwab', amount: 300, direction: 'debit', frequency: 'monthly', interval: 1, starts_at: '2026-01-03T12:00:00Z', ends_at: null, is_active: true },
  { name: 'The20', amount: 2500, direction: 'credit', frequency: 'monthly', interval: 1, starts_at: '2026-01-01T12:00:00Z', ends_at: null, is_active: true },
]

describe('computeAskInsights', () => {
  it('returns only the no_data insight for an empty account', () => {
    const out = computeAskInsights({ ...base, transactions: [], rules: [] })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('no_data')
    expect(out[0].action?.intent).toBe('log_expense')
  })

  it('names the next bill with its date and what is left this month', () => {
    const out = computeAskInsights({ ...base, transactions: [...groceriesPriorMonths, ...thisMonth], rules })
    const up = out.find((i) => i.kind === 'upcoming_bill')
    expect(up).toBeDefined()
    expect(up!.title).toBe('Netflix $14 due Aug 22')
    // still due between Aug 16 and month end: Netflix 14 (Xtream/Schwab already
    // occurred on the 3rd). income 2500 − spent (120+95+88+42+300+500+12+9+14+28+15 = 1223) − 14 = 1263
    expect(up!.detail).toBe('With $14 of bills still due, that leaves $1,263 this month.')
    expect(up!.action).toEqual({ label: 'Review recurring', intent: 'open_recurring', params: { name: 'Netflix' } })
  })

  it('flags the groceries surge against the same day-span of prior months', () => {
    const out = computeAskInsights({ ...base, transactions: [...groceriesPriorMonths, ...thisMonth], rules })
    const s = out.find((i) => i.kind === 'category_surge')
    expect(s).toBeDefined()
    // MTD groceries 303 vs avg by-the-16th of (102, 103, 100) = 101.67 → +198%
    expect(s!.title).toBe('Groceries $303 so far this month')
    expect(s!.detail).toBe('198% over your usual by this point in the month.')
    expect(s!.action).toEqual({
      label: 'See transactions',
      intent: 'show_transactions',
      params: { category_name: 'Groceries', month: '2026-08' },
    })
    expect(s!.question).toBe('Why is Groceries over this month?')
  })

  it('totals subscriptions and names the top two', () => {
    const out = computeAskInsights({ ...base, transactions: [...groceriesPriorMonths, ...thisMonth], rules })
    const s = out.find((i) => i.kind === 'subscriptions')
    // 300 + 42 + 14 = 356 monthly; ranking may push it out of the top 4, so
    // check via a rules-only account too.
    const only = computeAskInsights({ ...base, transactions: thisMonth.slice(0, 3), rules })
    const subs = s ?? only.find((i) => i.kind === 'subscriptions')
    expect(subs).toBeDefined()
    expect(subs!.title).toBe('Charles Schwab, Xtream + 1 more take $356 every month')
    expect(subs!.detail).toBe('Keep or cut?')
  })

  it('reports budget pace from the app-computed budget block', () => {
    const budget: AskMurmurBudget = {
      amount: 2000, currency: 'USD', period: 'monthly', category_name: null,
      period_start: '2026-08-01T05:00:00Z', period_end: '2026-09-01T05:00:00Z',
      spent: 1223, committed: 14, remaining: 763, days_left: 16,
    }
    const out = computeAskInsights({ ...base, budget, transactions: [...groceriesPriorMonths, ...thisMonth], rules })
    const b = out.find((i) => i.kind === 'budget_pace')
    expect(b).toBeDefined()
    expect(b!.title).toMatch(/\$763 left for 16 days/)
    expect(b!.action?.intent).toBe('set_budget')

    const over = computeAskInsights({ ...base, budget: { ...budget, remaining: -120 }, transactions: [...groceriesPriorMonths, ...thisMonth], rules })
    const ob = over.find((i) => i.kind === 'budget_pace')!
    expect(ob.title).toBe('Over budget by $120')
    expect(ob.tone).toBe('alert')
    expect(ob.score).toBe(95)
  })

  it('spots a large one-off purchase and never a recurring charge', () => {
    const out = computeAskInsights({ ...base, transactions: [...groceriesPriorMonths, ...thisMonth], rules })
    const l = out.find((i) => i.kind === 'large_transaction')
    // Louis Vuitton 500 vs a median debit around 49 → ≥ 3× and ≥ 100.
    // May be ranked below the top four; check on a quieter account.
    const quiet = computeAskInsights({ ...base, monthly_income: null, transactions: [...groceriesPriorMonths, ...thisMonth.filter((t) => t.category_name !== 'Groceries')], rules: [] })
    const found = l ?? quiet.find((i) => i.kind === 'large_transaction')
    expect(found).toBeDefined()
    expect(found!.title).toBe('Louis Vuitton $500 on Aug 15')
    expect(found!.action).toEqual({ label: 'See transaction', intent: 'show_transactions', params: { query: 'Louis Vuitton' } })
  })

  it('ranks by score, dedups by kind and caps at four', () => {
    const out = computeAskInsights({ ...base, transactions: [...groceriesPriorMonths, ...thisMonth], rules })
    expect(out.length).toBeLessThanOrEqual(4)
    expect(new Set(out.map((i) => i.kind)).size).toBe(out.length)
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score)
    // The surge (score ~100) and the upcoming bill (90) lead.
    expect(out[0].kind).toBe('category_surge')
    expect(out[1].kind).toBe('upcoming_bill')
  })

  it('formats in the user locale', () => {
    const out = computeAskInsights({ ...base, locale: 'fr', currency: 'EUR', transactions: [...groceriesPriorMonths, ...thisMonth], rules })
    const up = out.find((i) => i.kind === 'upcoming_bill')!
    expect(up.title).toContain('Netflix')
    expect(up.title).toContain('€')
    expect(up.action?.label).toBe('Voir les récurrents')
  })
})
