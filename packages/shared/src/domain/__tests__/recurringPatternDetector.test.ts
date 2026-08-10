import { describe, it, expect } from 'vitest'
import { detectRecurringPatterns } from '../recurringPatternDetector'
import type { Transaction } from '../../types/transaction'
import type { RecurringRule } from '../../types/recurring'

let seq = 0
function txn(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1
  const transactedAt = overrides.transacted_at ?? '2026-01-01T12:00:00.000Z'
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
    transacted_at: transactedAt,
    // Both derived from transacted_at at UTC by these fixtures — no
    // zone-conversion behaviour is under test here (that's period.ts's
    // own suite), just the detector's bucketing/gating logic.
    local_day: transactedAt.slice(0, 10),
    occurrence_date: null,
    snapshot_currency: null,
    source: 'manual',
    raw_transcript: null,
    ai_confidence: null,
    is_recurring: false,
    recurring_rule_id: null,
    recurring_frequency: null,
    client_id: `txn-${seq}`,
    client_created_at: transactedAt,
    version: 1,
    is_deleted: false,
    deleted_at: null,
    synced_at: null,
    created_at: transactedAt,
    updated_at: transactedAt,
    ...overrides,
  }
}

let ruleSeq = 0
function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  ruleSeq += 1
  return {
    id: `rule-${ruleSeq}`,
    user_id: 'user-1',
    client_id: `rule-${ruleSeq}`,
    name: 'Netflix',
    amount: 9.99,
    amount_in_profile_currency: 9.99,
    fx_rate_to_profile: 1,
    fx_rate_date: null,
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
    anchor_day: null,
    anchor_weekday: null,
    anchor_time: null,
    is_active: true,
    is_deleted: false,
    deleted_at: null,
    template_txn_id: null,
    synced_at: null,
    created_at: '2025-01-01T12:00:00.000Z',
    updated_at: '2025-01-01T12:00:00.000Z',
    version: 1,
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

  it('reports a genuine yearly pattern (gap ~365 days, >= 3 occurrences)', () => {
    // Slower-than-monthly cadences require >= 3 occurrences (fix-plan
    // 2.3) — two points 365 days apart is barely more than a
    // coincidence.
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', merchant: 'Amazon Prime', transacted_at: '2024-06-01T12:00:00.000Z' }),
        txn({ id: 'b', merchant: 'Amazon Prime', transacted_at: '2025-06-02T12:00:00.000Z' }),
        txn({ id: 'c', merchant: 'Amazon Prime', transacted_at: '2026-06-01T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].frequency).toBe('yearly')
    expect(candidates[0].occurrences).toBe(3)
  })

  it('two yearly-spaced charges alone are NOT enough (< 3 occurrences)', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', merchant: 'Amazon Prime', transacted_at: '2025-06-01T12:00:00.000Z' }),
        txn({ id: 'b', merchant: 'Amazon Prime', transacted_at: '2026-06-02T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(0)
  })

  it('two identical charges ~400 days apart infer no cadence at all', () => {
    // The yearly band caps at 395 days (fix-plan 2.3's "cap the yearly
    // bucket at ~400 days") — a 400-day gap is dropped outright, not
    // just short on occurrence count.
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', merchant: 'Xtream', transacted_at: '2025-01-01T12:00:00.000Z' }),
        txn({ id: 'b', merchant: 'Xtream', transacted_at: '2026-02-05T12:00:00.000Z' }), // 400 days
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(0)
  })

  it('reports a genuine quarterly pattern (gap ~91 days, >= 3 occurrences)', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', merchant: 'Insurer Co', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', merchant: 'Insurer Co', transacted_at: '2026-04-02T12:00:00.000Z' }),
        txn({ id: 'c', merchant: 'Insurer Co', transacted_at: '2026-07-01T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].frequency).toBe('quarterly')
    expect(candidates[0].occurrences).toBe(3)
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

  it('a wildly uneven set of gaps is dropped even if the median lands in a band', () => {
    // 10, 60, 25 days apart — median ~30 (reads "monthly"), but no
    // individual gap is within +/-25% of that median (fix-plan 2.3's
    // gap-variance requirement).
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', merchant: 'Erratic Co', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', merchant: 'Erratic Co', transacted_at: '2026-01-11T12:00:00.000Z' }), // +10
        txn({ id: 'c', merchant: 'Erratic Co', transacted_at: '2026-03-12T12:00:00.000Z' }), // +60
        txn({ id: 'd', merchant: 'Erratic Co', transacted_at: '2026-04-06T12:00:00.000Z' }), // +25
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(0)
  })
})

describe('detectRecurringPatterns — relative amount tolerance (fix-plan 2.3)', () => {
  it('clusters a variable bill into one pattern despite a price change', () => {
    // Netflix at $9.99 (Jun), then $10.99 (Jul, Aug) — a ~10% price
    // change, well inside AMOUNT_TOLERANCE. Exact-cents bucketing would
    // have split this into a dropped 1-occurrence bucket ($9.99) and a
    // 2-occurrence bucket ($10.99); relative tolerance keeps it one
    // 3-occurrence cluster.
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', amount: 9.99, transacted_at: '2026-06-01T12:00:00.000Z' }),
        txn({ id: 'b', amount: 10.99, transacted_at: '2026-07-01T12:00:00.000Z' }),
        txn({ id: 'c', amount: 10.99, transacted_at: '2026-08-01T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].occurrences).toBe(3)
    // Anchored on the newest occurrence — the candidate the "Set up"
    // action creates a rule from.
    expect(candidates[0].amount).toBe(10.99)
    expect(candidates[0].templateTxnId).toBe('c')
    expect(candidates[0].lastSeenAt).toBe('2026-08-01T12:00:00.000Z')
  })

  it('does NOT merge two genuinely distinct amount regimes for the same merchant', () => {
    // A $12 grocery run and an $800 electronics order at the same
    // merchant are not the same subscription — two separate 2-occurrence
    // clusters, never one 4-occurrence cluster averaging the two.
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', merchant: 'Amazon', amount: 12, transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', merchant: 'Amazon', amount: 12, transacted_at: '2026-02-01T12:00:00.000Z' }),
        txn({ id: 'c', merchant: 'Amazon', amount: 800, transacted_at: '2026-03-01T12:00:00.000Z' }),
        txn({ id: 'd', merchant: 'Amazon', amount: 800, transacted_at: '2026-04-01T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(2)
    expect(candidates.every((c) => c.occurrences === 2)).toBe(true)
    expect(new Set(candidates.map((c) => c.amount))).toEqual(new Set([12, 800]))
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

  it('skips credits and unmerchanted transactions', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', direction: 'credit', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', direction: 'credit', transacted_at: '2026-02-01T12:00:00.000Z' }),
        txn({ id: 'e', merchant: null, transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'f', merchant: null, transacted_at: '2026-02-01T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(0)
  })

  it('a bare `is_recurring` flag with no linked rule does NOT suppress the pattern (fix-plan 2.2)', () => {
    // A flagged-but-unlinked transaction (the FK-race ghost row 2.2
    // exists to close) does not imply a rule exists — `existingKeys`-
    // by-identity is what expresses that, not the flag.
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', is_recurring: true, transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', is_recurring: true, transacted_at: '2026-02-01T12:00:00.000Z' }),
      ],
      existingRules: [],
    })
    expect(candidates).toHaveLength(1)
  })

  it('skips a pattern already linked to a rule by identity, not by (name, amount)', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', recurring_rule_id: 'rule-1', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', recurring_rule_id: 'rule-1', transacted_at: '2026-02-01T12:00:00.000Z' }),
      ],
      existingRules: [rule({ id: 'rule-1', name: 'Netflix', amount: 9.99 })],
    })
    expect(candidates).toHaveLength(0)
  })

  it('a renamed rule still suppresses its own linked transactions', () => {
    // The old name/amount match would miss this the moment the rule's
    // name diverges from the transaction's merchant string.
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', recurring_rule_id: 'rule-1', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', recurring_rule_id: 'rule-1', transacted_at: '2026-02-01T12:00:00.000Z' }),
      ],
      existingRules: [rule({ id: 'rule-1', name: 'Streaming (renamed)', amount: 9.99 })],
    })
    expect(candidates).toHaveLength(0)
  })

  it('an unnamed rule still suppresses its own linked transactions', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', recurring_rule_id: 'rule-1', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', recurring_rule_id: 'rule-1', transacted_at: '2026-02-01T12:00:00.000Z' }),
      ],
      existingRules: [rule({ id: 'rule-1', name: null })],
    })
    expect(candidates).toHaveLength(0)
  })

  it('pausing a rule does not resurface its linked history as a new pattern', () => {
    const candidates = detectRecurringPatterns({
      transactions: [
        txn({ id: 'a', recurring_rule_id: 'rule-1', transacted_at: '2026-01-01T12:00:00.000Z' }),
        txn({ id: 'b', recurring_rule_id: 'rule-1', transacted_at: '2026-02-01T12:00:00.000Z' }),
      ],
      existingRules: [rule({ id: 'rule-1', is_active: false })],
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
