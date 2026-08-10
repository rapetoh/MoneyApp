import { describe, it, expect } from 'vitest'
import {
  budgetStatus,
  resolveBudgetAnchor,
  type BudgetStatusTransaction,
  type BudgetStatusRule,
} from '../budget'
import type { BudgetPeriod } from '../../types/budget'

function txn(overrides: Partial<BudgetStatusTransaction> = {}): BudgetStatusTransaction {
  return {
    amount_in_profile_currency: 50,
    direction: 'debit',
    transacted_at: '2026-08-15T12:00:00Z',
    category_id: null,
    ...overrides,
  }
}

function rule(overrides: Partial<BudgetStatusRule> = {}): BudgetStatusRule {
  return {
    id: 'rule-1',
    frequency: 'monthly',
    interval: 1,
    starts_at: '2026-08-05T00:00:00Z',
    ends_at: null,
    amount: 15,
    currency_code: 'USD',
    direction: 'debit',
    category_id: null,
    is_active: true,
    ...overrides,
  }
}

describe('resolveBudgetAnchor — bare civil day -> instant (fix-plan 2.5)', () => {
  it('converts a Postgres `date` (YYYY-MM-DD) to local midnight in tz', () => {
    expect(resolveBudgetAnchor('2026-08-01', 'America/Chicago')).toBe('2026-08-01T05:00:00.000Z')
  })

  it('passes an already-instant string through unchanged', () => {
    expect(resolveBudgetAnchor('2026-08-01T14:00:00Z', 'UTC')).toBe('2026-08-01T14:00:00Z')
  })
})

describe('budgetStatus — one definition for all five periods (04-F9/05-F5/05-F17/05-F18)', () => {
  const PERIODS: BudgetPeriod[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']

  it('returns identical windows on a fixed instant regardless of caller — table test', () => {
    const at = '2026-08-20T12:00:00Z'
    const tz = 'America/Chicago'
    for (const period of PERIODS) {
      const a = budgetStatus(
        { period, starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 1000 },
        [],
        [],
        tz,
        at,
      )
      const b = budgetStatus(
        { period, starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 1000 },
        [],
        [],
        tz,
        at,
      )
      expect(b.window).toEqual(a.window)
    }
  })

  it('quarterly and yearly get their own bounds, not the monthly fallback', () => {
    const at = '2026-08-20T12:00:00Z'
    const tz = 'UTC'
    const quarterly = budgetStatus(
      { period: 'quarterly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 100 },
      [],
      [],
      tz,
      at,
    )
    const yearly = budgetStatus(
      { period: 'yearly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 100 },
      [],
      [],
      tz,
      at,
    )
    const monthly = budgetStatus(
      { period: 'monthly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 100 },
      [],
      [],
      tz,
      at,
    )
    expect(quarterly.window).toEqual({ start: '2026-07-01T00:00:00.000Z', endExclusive: '2026-10-01T00:00:00.000Z' })
    expect(yearly.window).toEqual({ start: '2026-01-01T00:00:00.000Z', endExclusive: '2027-01-01T00:00:00.000Z' })
    expect(quarterly.window).not.toEqual(monthly.window)
    expect(yearly.window).not.toEqual(monthly.window)
  })

  it('biweekly anchored 2026-08-01 reports [2026-08-15, 2026-08-29) on both the 20th and the 21st', () => {
    const tz = 'UTC'
    const budget = { period: 'biweekly' as const, starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 500 }
    const on20th = budgetStatus(budget, [], [], tz, '2026-08-20T12:00:00Z')
    const on21st = budgetStatus(budget, [], [], tz, '2026-08-21T12:00:00Z')
    expect(on20th.window).toEqual({ start: '2026-08-15T00:00:00.000Z', endExclusive: '2026-08-29T00:00:00.000Z' })
    expect(on21st.window).toEqual(on20th.window)
  })

  it('a transaction 40 days in the future reports spent === 0 and committed === 0 (out of window entirely)', () => {
    const status = budgetStatus(
      { period: 'monthly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 100 },
      [txn({ amount_in_profile_currency: 50, transacted_at: '2026-09-17T12:00:00Z' })],
      [],
      'UTC',
      '2026-08-08T12:00:00Z',
    )
    expect(status.spent).toBe(0)
    expect(status.committed).toBe(0)
  })

  it('a future-dated row still inside the window counts as committed, not spent', () => {
    const status = budgetStatus(
      { period: 'monthly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 1000 },
      [txn({ amount_in_profile_currency: 50, transacted_at: '2026-08-25T12:00:00Z' })],
      [],
      'UTC',
      '2026-08-08T12:00:00Z',
    )
    expect(status.spent).toBe(0)
    expect(status.committed).toBe(50)
  })

  it('excludes a transfer-kind category from spent (fix-plan 1.4 adoption)', () => {
    const status = budgetStatus(
      { period: 'monthly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 1000 },
      [
        txn({ amount_in_profile_currency: 50, category_name: 'Food & Dining' }),
        txn({ amount_in_profile_currency: 300, category_name: 'Savings & Investing' }),
      ],
      [],
      'UTC',
      '2026-08-20T12:00:00Z',
    )
    expect(status.spent).toBe(50)
  })

  it('sums a due, unposted recurring rule into committed', () => {
    const status = budgetStatus(
      { period: 'monthly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 1000 },
      [],
      [rule({ amount: 15 })],
      'UTC',
      '2026-08-20T12:00:00Z',
    )
    expect(status.committed).toBe(15)
  })

  it('does not double-count a rule occurrence that already posted as a transaction', () => {
    const status = budgetStatus(
      { period: 'monthly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 1000 },
      [txn({ amount_in_profile_currency: 15, transacted_at: '2026-08-05T12:00:00Z', recurring_rule_id: 'rule-1' })],
      [rule({ amount: 15 })],
      'UTC',
      '2026-08-20T12:00:00Z',
    )
    expect(status.spent).toBe(15)
    expect(status.committed).toBe(0)
  })

  it('excludes a recurring rule whose currency does not match the budget rather than summing it at face value', () => {
    const status = budgetStatus(
      { period: 'monthly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 1000 },
      [],
      [rule({ amount: 15, currency_code: 'EUR' })],
      'UTC',
      '2026-08-20T12:00:00Z',
    )
    expect(status.committed).toBe(0)
  })

  it('scopes to only the matching category for a per-category budget', () => {
    const status = budgetStatus(
      { period: 'monthly', starts_at: '2026-08-01', category_id: 'cat-food', currency_code: 'USD', amount: 200 },
      [
        txn({ amount_in_profile_currency: 50, category_id: 'cat-food' }),
        txn({ amount_in_profile_currency: 999, category_id: 'cat-other' }),
      ],
      [],
      'UTC',
      '2026-08-20T12:00:00Z',
    )
    expect(status.spent).toBe(50)
  })

  it('excludes a pending-FX transaction from spent and reports it in pendingCount', () => {
    const status = budgetStatus(
      { period: 'monthly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 200 },
      [txn({ amount_in_profile_currency: null })],
      [],
      'UTC',
      '2026-08-20T12:00:00Z',
    )
    expect(status.spent).toBe(0)
    expect(status.pendingCount).toBe(1)
  })

  it('remaining and pct are derived from spent + committed together', () => {
    const status = budgetStatus(
      { period: 'monthly', starts_at: '2026-08-01', category_id: null, currency_code: 'USD', amount: 100 },
      [txn({ amount_in_profile_currency: 40 })],
      [rule({ amount: 10 })],
      'UTC',
      '2026-08-20T12:00:00Z',
    )
    expect(status.spent).toBe(40)
    expect(status.committed).toBe(10)
    expect(status.remaining).toBe(50)
    expect(status.pct).toBe(0.5)
  })
})
