import { describe, it, expect } from 'vitest'
import { classifyError, computeBackoffMs, isRecurringDedupConflict } from '../retryPolicy'

describe('isRecurringDedupConflict', () => {
  it('matches 23505 mentioning the recurring dedup index', () => {
    expect(
      isRecurringDedupConflict({
        code: '23505',
        message: 'duplicate key value violates unique constraint "idx_txn_recurring_dedup"',
      }),
    ).toBe(true)
  })

  it('does not match a 23505 on a different constraint', () => {
    expect(
      isRecurringDedupConflict({
        code: '23505',
        message: 'duplicate key value violates unique constraint "transactions_user_client_unique"',
      }),
    ).toBe(false)
  })

  it('does not match a non-23505 code', () => {
    expect(isRecurringDedupConflict({ code: '23514', message: 'idx_txn_recurring_dedup' })).toBe(false)
  })

  it('is false for null/undefined', () => {
    expect(isRecurringDedupConflict(null)).toBe(false)
    expect(isRecurringDedupConflict(undefined)).toBe(false)
  })
})

describe('classifyError', () => {
  it('classifies the recurring-dedup carve-out separately from a generic permanent error', () => {
    expect(
      classifyError({ code: '23505', message: 'unique constraint "idx_txn_recurring_dedup"' }),
    ).toBe('recurring_dedup')
  })

  it('classifies any other 23xxx as permanent — a CHECK violation (23514) dead-letters, not retries', () => {
    expect(classifyError({ code: '23514', message: 'violates check constraint "transactions_amount_check"' })).toBe(
      'permanent',
    )
  })

  it('classifies a different unique violation (not the recurring index) as permanent, never soft-deleted', () => {
    expect(
      classifyError({ code: '23505', message: 'duplicate key value violates unique constraint "transactions_pkey"' }),
    ).toBe('permanent')
  })

  it('classifies 42xxx (e.g. an unknown column) as permanent', () => {
    expect(classifyError({ code: '42703', message: 'column "bogus" does not exist' })).toBe('permanent')
  })

  it('classifies a network failure with no SQLSTATE as transient', () => {
    expect(classifyError({ message: 'Network request failed' })).toBe('transient')
  })

  it('classifies a 5xx-flavoured error with no code as transient', () => {
    expect(classifyError({ message: '503 Service Unavailable' })).toBe('transient')
  })

  it('classifies null as transient (safe default, not a false permanent verdict)', () => {
    expect(classifyError(null)).toBe('transient')
  })
})

describe('computeBackoffMs', () => {
  it('starts at 30s for retryCount 0, plus up to 20% jitter', () => {
    const delay = computeBackoffMs(0, () => 0)
    expect(delay).toBe(30_000)
    const delayWithMaxJitter = computeBackoffMs(0, () => 1)
    expect(delayWithMaxJitter).toBe(36_000)
  })

  it('doubles per retry', () => {
    expect(computeBackoffMs(1, () => 0)).toBe(60_000)
    expect(computeBackoffMs(2, () => 0)).toBe(120_000)
    expect(computeBackoffMs(3, () => 0)).toBe(240_000)
  })

  it('caps at 15 minutes', () => {
    expect(computeBackoffMs(10, () => 0)).toBe(15 * 60_000)
    expect(computeBackoffMs(100, () => 0)).toBe(15 * 60_000)
  })

  it('never returns a delay shorter than the base for a negative retryCount', () => {
    expect(computeBackoffMs(-5, () => 0)).toBe(30_000)
  })
})
