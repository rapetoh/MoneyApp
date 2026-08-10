import { describe, it, expect } from 'vitest'
import {
  heaviestWeekday,
  categoryShare,
  topMerchants,
  heatmap,
  patterns,
  type PatternTxn,
  type PatternWindow,
} from '../patterns'

function txn(overrides: Partial<PatternTxn> = {}): PatternTxn {
  return {
    amount_in_profile_currency: 10,
    direction: 'debit',
    transacted_at: '2026-08-15T12:00:00Z',
    merchant: 'Starbucks',
    category_id: 'cat-food',
    category_name: 'Food & Dining',
    ...overrides,
  }
}

const NINETY_DAY_WINDOW: PatternWindow = { start: '2026-05-01T00:00:00Z', endExclusive: '2026-08-31T00:00:00Z' }

describe('2.11 "Done when": three transactions on one day claim nothing', () => {
  const txns: PatternTxn[] = [
    txn({ transacted_at: '2026-08-15T09:00:00Z' }),
    txn({ transacted_at: '2026-08-15T12:00:00Z' }),
    txn({ transacted_at: '2026-08-15T18:00:00Z' }),
  ]
  it('no weekday claim', () => {
    expect(heaviestWeekday(txns, NINETY_DAY_WINDOW, 'UTC').confident).toBe(false)
  })
  it('no category-share claim', () => {
    expect(categoryShare(txns, NINETY_DAY_WINDOW, 'UTC').confident).toBe(false)
  })
  it('patterns() returns nothing to render', () => {
    expect(patterns(txns, NINETY_DAY_WINDOW, 'UTC')).toEqual([])
  })
})

describe('heaviestWeekday — divides by the actual weekday count, not a literal 12/13 (05-F6)', () => {
  it('4 Saturdays at $30 + 12 other-weekday txns at $5 averages Saturday at $30, not $360/13', () => {
    const txns: PatternTxn[] = []
    // 2026-08-01, 08, 15, 22 are Saturdays.
    for (const d of ['01', '08', '15', '22']) {
      txns.push(txn({ transacted_at: `2026-08-${d}T12:00:00Z`, amount_in_profile_currency: 30 }))
    }
    // 12 weekday (non-Saturday) transactions to clear the ≥12-total gate.
    for (let i = 0; i < 12; i++) {
      txns.push(txn({ transacted_at: `2026-08-0${(i % 6) + 2}T09:00:00Z`, amount_in_profile_currency: 5 }))
    }
    const result = heaviestWeekday(txns, NINETY_DAY_WINDOW, 'UTC')
    expect(result.confident).toBe(true)
    expect(result.data?.weekdayIndex).toBe(5) // Monday=0 … Saturday=5
    expect(result.data?.average).toBe(30)
    expect(result.data?.observedCount).toBe(4)
  })

  it('only 3 observed instances of the heaviest weekday is not confident, even with 12+ total transactions', () => {
    const txns: PatternTxn[] = []
    for (const d of ['01', '08', '15']) {
      txns.push(txn({ transacted_at: `2026-08-${d}T12:00:00Z`, amount_in_profile_currency: 30 }))
    }
    for (let i = 0; i < 12; i++) {
      txns.push(txn({ transacted_at: `2026-08-0${(i % 6) + 2}T09:00:00Z`, amount_in_profile_currency: 5 }))
    }
    expect(heaviestWeekday(txns, NINETY_DAY_WINDOW, 'UTC').confident).toBe(false)
  })
})

describe('categoryShare — denominator is the full spend total, never a truncated top-N subtotal (05-F36/05-F37)', () => {
  it('9 categories totalling 1000 with Groceries at 200 reports 20%, not 25%', () => {
    const txns: PatternTxn[] = []
    let day = 1
    const cats = ['Groceries', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
    const amounts = [200, 100, 100, 100, 100, 100, 100, 100, 100]
    for (let c = 0; c < cats.length; c++) {
      // Spread each category's total across 3 days so the ≥21-distinct-
      // day gate is cleared without inflating any single category.
      for (let k = 0; k < 3; k++) {
        txns.push(
          txn({
            transacted_at: `2026-06-${String(day).padStart(2, '0')}T12:00:00Z`,
            amount_in_profile_currency: amounts[c] / 3,
            category_id: `cat-${cats[c]}`,
            category_name: cats[c],
          }),
        )
        day++
      }
    }
    const result = categoryShare(txns, NINETY_DAY_WINDOW, 'UTC')
    expect(result.confident).toBe(true)
    expect(result.sampleSize).toBe(27)
    expect(result.data?.categoryId).toBe('cat-Groceries')
    expect(result.data?.total as number).toBeCloseTo(1000, 5)
    expect(result.data?.share as number).toBeCloseTo(0.2, 5)
  })

  it('a Savings & Investing transfer never wins the share (excluded from both numerator and denominator)', () => {
    const txns: PatternTxn[] = []
    let day = 1
    for (let i = 0; i < 21; i++) {
      txns.push(
        txn({
          transacted_at: `2026-06-${String(day).padStart(2, '0')}T12:00:00Z`,
          amount_in_profile_currency: 10,
          category_id: 'cat-food',
          category_name: 'Food & Dining',
        }),
      )
      day++
    }
    txns.push(
      txn({
        transacted_at: '2026-06-01T13:00:00Z',
        amount_in_profile_currency: 5000,
        category_id: 'cat-save',
        category_name: 'Savings & Investing',
      }),
    )
    const result = categoryShare(txns, NINETY_DAY_WINDOW, 'UTC')
    expect(result.data?.categoryId).toBe('cat-food')
    expect(result.data?.share).toBe(1)
  })
})

describe('topMerchants — gated on ≥5 distinct merchants', () => {
  it('4 merchants is not confident', () => {
    const txns = ['A', 'B', 'C', 'D'].map((m) => txn({ merchant: m }))
    expect(topMerchants(txns, NINETY_DAY_WINDOW).confident).toBe(false)
  })
  it('5 merchants is confident and ranked by amount', () => {
    const txns = [
      txn({ merchant: 'A', amount_in_profile_currency: 10 }),
      txn({ merchant: 'B', amount_in_profile_currency: 50 }),
      txn({ merchant: 'C', amount_in_profile_currency: 5 }),
      txn({ merchant: 'D', amount_in_profile_currency: 5 }),
      txn({ merchant: 'E', amount_in_profile_currency: 5 }),
    ]
    const result = topMerchants(txns, NINETY_DAY_WINDOW)
    expect(result.confident).toBe(true)
    expect(result.data?.merchants[0]).toEqual({ merchant: 'B', amount: 50 })
  })
})

describe('heatmap — covers all 24 hours, gated on ≥20 transactions (04-F16)', () => {
  it('a 23:30 UTC transaction lands in hour bucket 23, not silently dropped', () => {
    const txns: PatternTxn[] = []
    for (let i = 0; i < 19; i++) {
      txns.push(txn({ transacted_at: `2026-06-${String(i + 1).padStart(2, '0')}T09:00:00Z` }))
    }
    txns.push(txn({ transacted_at: '2026-06-20T23:30:00Z', amount_in_profile_currency: 15 }))
    const result = heatmap(txns, NINETY_DAY_WINDOW, 'UTC')
    expect(result.confident).toBe(true) // 20 total
    const matrix = result.data!.matrix
    const totalAtHour23 = matrix.reduce((s, row) => s + row[23], 0)
    expect(totalAtHour23).toBe(15)
  })
  it('19 transactions is not confident', () => {
    const txns: PatternTxn[] = []
    for (let i = 0; i < 19; i++) {
      txns.push(txn({ transacted_at: `2026-06-${String(i + 1).padStart(2, '0')}T09:00:00Z` }))
    }
    expect(heatmap(txns, NINETY_DAY_WINDOW, 'UTC').confident).toBe(false)
  })
})
