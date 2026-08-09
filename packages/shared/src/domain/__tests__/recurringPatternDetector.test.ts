import { describe, it, expect } from 'vitest'
import { detectRecurringPatterns } from '../recurringPatternDetector'
import type { Transaction } from '../../types/transaction'
import type { RecurringRule } from '../../types/recurring'

let seq = 0
function txn(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    id: `txn-${seq}`,
    user_id: 'user-1',
    amount: 9.99,
    amount_in_profile_currency: 9.99,
    fx_rate_to_profile: 1,
    fx_rate_date: null,
    direction: 'debit',
    currency_code: 'USD',
    category_id: null,
    merchant: 'Netflix',
    merchant_domain: null,
    note: null,
    payment_method: null,
    transacted_at: '2026-01-01T12:00:00.000Z',
    source: 'manual',
    raw_transcript: null,
    ai_confidence: null,
    is_recurring: false,
    recurring_rule_id: null,
    recurring_frequency: null,
    client_id: `txn-${seq}`,
    client_created_at: '2026-01-01T12:00:00.000Z',
    version: 1,
    is_deleted: false,
    deleted_at: null,
    synced_at: null,
    created_at: '2026-01-01T12:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('detectRecurringPatterns — cadence consistency', () => {
  it('two charges six months apart are NOT reported as yearly', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', transacted_at: '2026-01-15T12:00:00.000Z' }),
        txn({ id: 'b', transacted_at: '2026-07-15T12:00:00.000Z' }), // ~181 days later
      ],
      existingRules: [],
    })
    // A ~181-day gap doesn't land confidently in any canonical band
    // (monthly tops out at 45, yearly starts at 335) — the candidate is
    // dropped rather than mislabeled "likely yearly".
    expect(candidates).toHaveLength(0)
  })

  it('still reports a genuine monthly pattern (gap ~30 days)', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', transacted_at: '2026-02-01T12:00:00.000Z' }),
        txn({ id: 'c', transacted_at: '2026-03-03T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].frequency).toBe('monthly')
    expect(candidates[0].occurrences).toBe(3)
  })

  it('reports a genuine yearly pattern (gap ~365 days)', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', merchant: 'Amazon Prime', transacted_at: '2025-06-01T12:00:00.000Z' }),
        txn({ id: 'b', merchant: 'Amazon Prime', transacted_at: '2026-06-02T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].frequency).toBe('yearly')
  })

  it('reports a genuine quarterly pattern (gap ~91 days)', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', merchant: 'Insurer Co', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', merchant: 'Insurer Co', transacted_at: '2026-04-02T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].frequency).toBe('quarterly')
  })

  it('a gap that matches no canonical band (e.g. ~60 days, "bimonthly") is dropped entirely', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', transacted_at: '2026-03-02T12:00:00.000Z' }), // 60 days
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(0)
  })
})

describe('detectRecurringPatterns — existing heuristics preserved', () => {
  it('requires at least 21 days of spread', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', transacted_at: '2026-01-05T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(0)
  })

  it('skips credits, already-recurring, and unmerchanted transactions', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', direction: 'credit', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', direction: 'credit', transacted_at: '2026-02-01T12:00:00.000Z' }),
        txn({ id: 'c', is_recurring: true, transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'd', is_recurring: true, transacted_at: '2026-02-01T12:00:00.000Z' }),
        txn({ id: 'e', merchant: null, transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'f', merchant: null, transacted_at: '2026-02-01T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(0)
  })

  it('skips a pattern already covered by an active rule', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', transacted_at: '2026-02-01T12:00:00.000Z' }),
      ],
      existingRules: [
        {
          id: 'rule-1',
          user_id: 'user-1',
          name: 'Netflix',
          amount: 9.99,
          currency_code: 'USD',
          category_id: null,
          direction: 'debit',
          payment_method: null,
          note: null,
          frequency: 'monthly',
          interval: 1,
          starts_at: '2025-01-01T12:00:00.000Z',
          ends_at: null,
          last_generated: null,
          is_active: true,
          template_txn_id: null,
          created_at: '2025-01-01T12:00:00.000Z',
        } satisfies RecurringRule,
      ],
    })
    expect(candidates).toHaveLength(0)
  })

  it('honours dismissed keys', () => {
    const first = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', transacted_at: '2026-02-01T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(first).toHaveLength(1)
    const dismissed = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', transacted_at: '2026-02-01T12:00:00.000Z' }),
      ],
      existingRules: [],
      dismissedKeys: new Set([first[0].key]),
    })
    expect(dismissed).toHaveLength(0)
  })
})
