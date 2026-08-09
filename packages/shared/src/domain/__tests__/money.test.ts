import { describe, it, expect } from 'vitest'
import {
  summarize,
  classifyFlow,
  isSpend,
  resolveCategoryKind,
  UNCATEGORIZED_CATEGORY_KEY,
  DEFAULT_TRANSFER_CATEGORY_NAMES,
  type SummarizableTransaction,
} from '../money'

/** Minimal fixture builder — every field `summarize()` structurally
 *  needs, nothing more, so each test only states what it's varying. */
function txn(overrides: Partial<SummarizableTransaction> = {}): SummarizableTransaction {
  return {
    amount_in_profile_currency: 10,
    direction: 'debit',
    transacted_at: '2026-08-15T12:00:00Z',
    category_id: 'cat-1',
    category_name: 'Food & Dining',
    ...overrides,
  }
}

describe('summarize — the audit scenario (05-F2 / 08-F13 / 02-F17)', () => {
  it('Starbucks -50 + Xtream -42 + Schwab -300 (Savings & Investing) => out=92 not 392, transfers=300', () => {
    const result = summarize([
      txn({
        category_id: 'cat-food',
        category_name: 'Food & Dining',
        amount_in_profile_currency: 50,
      }),
      txn({
        category_id: 'cat-subs',
        category_name: 'Subscriptions',
        amount_in_profile_currency: 42,
      }),
      txn({
        category_id: 'cat-savings',
        category_name: 'Savings & Investing',
        amount_in_profile_currency: 300,
      }),
    ])

    expect(result.expense).toBe(92) // NOT 392 — the original bug
    expect(result.transfers).toBe(300)
    expect(result.income).toBe(0)
    expect(result.transactionCount).toBe(3)
    expect(result.pendingCount).toBe(0)
  })

  it('the FIX-PLAN done-when fixture: credit 1000, debit 100 (Food), debit 300 (Savings & Investing)', () => {
    const result = summarize([
      txn({ direction: 'credit', category_id: null, category_name: null, amount_in_profile_currency: 1000 }),
      txn({ category_id: 'cat-food', category_name: 'Food & Dining', amount_in_profile_currency: 100 }),
      txn({ category_id: 'cat-savings', category_name: 'Savings & Investing', amount_in_profile_currency: 300 }),
    ])

    expect(result.income).toBe(1000)
    expect(result.expense).toBe(100)
    expect(result.transfers).toBe(300)
    expect(result.saved).toBe(900)
  })

  it('the six formerly-divergent "saved" definitions now have exactly one answer: saved === net, unfloored, sign explicit', () => {
    // The exact production symptom from 05-F2: $0 in, $92 out, on the
    // same account a Savings & Investing transaction exists. The old
    // `max(0, in - out)` formula printed "$0 saved". This one prints
    // the true, negative figure instead of flooring it away.
    const result = summarize([
      txn({ category_id: 'cat-food', category_name: 'Food & Dining', amount_in_profile_currency: 92 }),
    ])
    expect(result.income).toBe(0)
    expect(result.expense).toBe(92)
    expect(result.saved).toBe(-92)
    expect(result.net).toBe(result.saved) // one formula, two names
  })

  it('a transfer credit (money moved back out of savings) reduces transfers rather than counting as income', () => {
    const result = summarize([
      txn({
        direction: 'credit',
        category_id: 'cat-savings',
        category_name: 'Savings & Investing',
        amount_in_profile_currency: 120,
      }),
    ])
    expect(result.income).toBe(0)
    expect(result.transfers).toBe(-120)
  })
})

describe('summarize — FX-pending rows never silently collapse to 0 (07-F8 / 06-F34 / 05-F12)', () => {
  it('excludes a null amount_in_profile_currency row from every total and surfaces pendingCount', () => {
    const result = summarize([
      txn({ amount_in_profile_currency: 100 }),
      txn({ amount_in_profile_currency: null }),
    ])
    expect(result.expense).toBe(100) // the pending row contributes nothing, silently or otherwise
    expect(result.pendingCount).toBe(1)
    expect(result.transactionCount).toBe(2) // still counted as a transaction
  })

  it('a pending transfer row is excluded from transfers too, not folded in as 0', () => {
    const result = summarize([
      txn({
        category_id: 'cat-savings',
        category_name: 'Savings & Investing',
        amount_in_profile_currency: null,
      }),
    ])
    expect(result.transfers).toBe(0)
    expect(result.pendingCount).toBe(1)
  })
})

describe('summarize — byCategory is the full map, never truncated (05-F36 / 05-F37)', () => {
  it('returns every category, and the values sum to expense exactly', () => {
    const cats = Array.from({ length: 12 }, (_, i) => ({
      id: `cat-${i}`,
      name: `Category ${i}`,
      amount: i + 1,
    }))
    const result = summarize(
      cats.map((c) => txn({ category_id: c.id, category_name: c.name, amount_in_profile_currency: c.amount })),
    )
    expect(Object.keys(result.byCategory)).toHaveLength(12)
    const total = Object.values(result.byCategory).reduce((s, c) => s + c.amount, 0)
    expect(total).toBe(result.expense)
  })

  it('groups uncategorized transactions under UNCATEGORIZED_CATEGORY_KEY', () => {
    const result = summarize([txn({ category_id: null, category_name: null })])
    expect(result.byCategory[UNCATEGORIZED_CATEGORY_KEY]).toBeDefined()
    expect(result.byCategory[UNCATEGORIZED_CATEGORY_KEY].amount).toBe(10)
  })

  it('excludes transfer and income categories from byCategory', () => {
    const result = summarize([
      txn({ direction: 'credit', category_id: null, category_name: null, amount_in_profile_currency: 1000 }),
      txn({ category_id: 'cat-savings', category_name: 'Savings & Investing', amount_in_profile_currency: 300 }),
      txn({ category_id: 'cat-food', category_name: 'Food & Dining', amount_in_profile_currency: 50 }),
    ])
    expect(Object.keys(result.byCategory)).toEqual(['cat-food'])
  })
})

describe('summarize — window filtering is half-open [start, endExclusive)', () => {
  const inMonth = txn({ transacted_at: '2026-08-01T00:00:00Z', amount_in_profile_currency: 1 })
  const atEndExclusive = txn({ transacted_at: '2026-09-01T00:00:00Z', amount_in_profile_currency: 2 })
  const beforeStart = txn({ transacted_at: '2026-07-31T23:59:59Z', amount_in_profile_currency: 4 })

  it('includes the start instant and excludes the end instant', () => {
    const result = summarize([inMonth, atEndExclusive, beforeStart], {
      start: '2026-08-01T00:00:00Z',
      endExclusive: '2026-09-01T00:00:00Z',
    })
    expect(result.transactionCount).toBe(1)
    expect(result.expense).toBe(1)
  })

  it('with no window, summarizes every given transaction', () => {
    const result = summarize([inMonth, atEndExclusive, beforeStart])
    expect(result.transactionCount).toBe(3)
  })
})

describe('summarize — integer-cents internal arithmetic (05-F32)', () => {
  it('a long series of 2-decimal amounts never drifts off a rounding boundary', () => {
    const rows = Array.from({ length: 1000 }, () => txn({ amount_in_profile_currency: 0.1 }))
    const result = summarize(rows)
    expect(result.expense).toBe(100) // not 99.99999999999999
  })
})

describe('classifyFlow / isSpend', () => {
  it('credit with no category kind is income', () => {
    expect(classifyFlow({ direction: 'credit' })).toBe('income')
    expect(isSpend({ direction: 'credit' })).toBe(false)
  })

  it('debit with no category kind is expense', () => {
    expect(classifyFlow({ direction: 'debit' })).toBe('expense')
    expect(isSpend({ direction: 'debit' })).toBe(true)
  })

  it('a transfer category kind overrides direction, on either side', () => {
    expect(classifyFlow({ direction: 'debit' }, 'transfer')).toBe('transfer')
    expect(classifyFlow({ direction: 'credit' }, 'transfer')).toBe('transfer')
    expect(isSpend({ direction: 'debit' }, 'transfer')).toBe(false)
  })

  it('an income category kind overrides a debit', () => {
    expect(classifyFlow({ direction: 'debit' }, 'income')).toBe('income')
  })
})

describe('resolveCategoryKind', () => {
  it('an explicit kind always wins', () => {
    expect(resolveCategoryKind('Anything', 'spend')).toBe('spend')
    expect(resolveCategoryKind('Savings & Investing', 'spend')).toBe('spend')
  })

  it('falls back to the default transfer-category-name table', () => {
    expect(resolveCategoryKind('Savings & Investing')).toBe('transfer')
    expect(resolveCategoryKind('Food & Dining')).toBeNull()
  })

  it('the default table contains exactly the seeded transfer category', () => {
    expect(DEFAULT_TRANSFER_CATEGORY_NAMES.has('Savings & Investing')).toBe(true)
  })
})
