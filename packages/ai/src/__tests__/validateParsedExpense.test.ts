// Unit tests for the typed parse boundary — fix-plan item 1.7.
//
// `validateParsedExpense` is the one place that decides whether a model's
// raw JSON is safe to save. These tests exercise it directly (no fetch
// mocking — see goldenCorpus.test.ts for the full parseExpense() pipeline)
// so every field's accept/reject boundary is pinned independently.

import { describe, it, expect } from 'vitest'
import {
  validateParsedExpense,
  assertParsedExpense,
  validateTransactionWriteFields,
  isParseRejection,
  deriveDirectionFromFlowType,
  ParseValidationError,
  DEFAULT_MAX_NOTE_LENGTH,
  FLOW_TYPE_VALUES,
} from '../validateParsedExpense'

const VALID: Record<string, unknown> = {
  amount: 42.5,
  currency: 'USD',
  flow_type: 'expense',
  merchant: 'Starbucks',
  merchant_domain: 'starbucks.com',
  note: 'Latte and a muffin',
  category_suggestion: 'Food & Dining',
  payment_method: 'credit_card',
  transacted_at: '2026-08-08T14:39:14.000Z',
  confidence: 0.92,
  needs_clarification: false,
  clarifying_question: null,
  is_recurring_suggestion: false,
  recurring_frequency_suggestion: null,
}

describe('validateParsedExpense — valid input', () => {
  it('passes a well-formed response through unchanged (modulo currency casing)', () => {
    const result = validateParsedExpense(VALID)
    expect(isParseRejection(result)).toBe(false)
    if (isParseRejection(result)) return
    expect(result.amount).toBe(42.5)
    expect(result.currency).toBe('USD')
    expect(result.flow_type).toBe('expense')
    expect(result.direction).toBe('debit')
    expect(result.merchant).toBe('Starbucks')
    expect(result.confidence).toBe(0.92)
  })

  it('uppercases a lowercase currency code', () => {
    const result = validateParsedExpense({ ...VALID, currency: 'usd' })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) expect(result.currency).toBe('USD')
  })
})

describe('validateParsedExpense — the four regression cases from the fix plan', () => {
  it('rejects {} (nothing present)', () => {
    const result = validateParsedExpense({})
    expect(isParseRejection(result)).toBe(true)
  })

  it('rejects {amount: "12"} (string, not number)', () => {
    const result = validateParsedExpense({ amount: '12' })
    expect(isParseRejection(result)).toBe(true)
    if (isParseRejection(result)) {
      expect(result.errors.some((e) => e.field === 'amount')).toBe(true)
    }
  })

  it('rejects {flow_type: "expensive"} (not in the flow_type enum)', () => {
    // The plan's own worked example used `direction: "expense"` — an
    // enum-mismatch input for the debit/credit field that existed then.
    // `direction` is no longer part of the model's contract (fix-plan
    // item 1.7, part 1: the model returns `flow_type`, code derives the
    // sign), so the analogous "plausible-looking but wrong" value is a
    // `flow_type` string that isn't one of the six real ones.
    const result = validateParsedExpense({ flow_type: 'expensive' })
    expect(isParseRejection(result)).toBe(true)
    if (isParseRejection(result)) {
      expect(result.errors.some((e) => e.field === 'flow_type')).toBe(true)
    }
  })

  it('a raw `direction` the model returns is ignored, not validated or trusted', () => {
    // Confirms `direction` is inert on the input side: an object with a
    // *valid* debit/credit `direction` but no `flow_type` still gets
    // rejected for the missing `flow_type`, and a `direction` full of
    // garbage does not itself produce a `direction` field error, because
    // nothing checks it anymore.
    const result = validateParsedExpense({ ...VALID, flow_type: undefined, direction: 'not-a-real-direction' })
    expect(isParseRejection(result)).toBe(true)
    if (isParseRejection(result)) {
      expect(result.errors.some((e) => e.field === 'direction')).toBe(false)
      expect(result.errors.some((e) => e.field === 'flow_type')).toBe(true)
    }
  })

  it('rejects {payment_method: "venmo"} (not a DB enum value)', () => {
    const result = validateParsedExpense({ payment_method: 'venmo' })
    expect(isParseRejection(result)).toBe(true)
    if (isParseRejection(result)) {
      expect(result.errors.some((e) => e.field === 'payment_method')).toBe(true)
    }
  })

  it('the fix plan\'s worked rejection example fails at the boundary, not at save time', () => {
    // Adapted for the flow_type contract (fix-plan item 1.7, part 1): the
    // plan's own example named `direction: "expense"` as one of four
    // sibling failures alongside a bad payment_method/confidence/currency.
    // `flow_type: "expensive"` is the same class of failure — a
    // plausible-looking string outside the real enum — for the field
    // that actually gates the model's input today.
    const result = validateParsedExpense({
      flow_type: 'expensive',
      payment_method: 'venmo',
      confidence: 1.4,
      currency: 'dollars',
    })
    expect(isParseRejection(result)).toBe(true)
    if (isParseRejection(result)) {
      const fields = result.errors.map((e) => e.field).sort()
      expect(fields).toEqual(['amount', 'currency', 'flow_type', 'payment_method', 'transacted_at'])
    }
  })
})

describe('validateParsedExpense — amount', () => {
  it('rejects zero and negative amounts', () => {
    expect(isParseRejection(validateParsedExpense({ ...VALID, amount: 0 }))).toBe(true)
    expect(isParseRejection(validateParsedExpense({ ...VALID, amount: -5 }))).toBe(true)
  })

  it('rejects non-finite amounts', () => {
    expect(isParseRejection(validateParsedExpense({ ...VALID, amount: Infinity }))).toBe(true)
    expect(isParseRejection(validateParsedExpense({ ...VALID, amount: NaN }))).toBe(true)
  })

  it('rejects amounts at or above 1e9', () => {
    expect(isParseRejection(validateParsedExpense({ ...VALID, amount: 1e9 }))).toBe(true)
    expect(isParseRejection(validateParsedExpense({ ...VALID, amount: 999_999_999.99 }))).toBe(false)
  })

  it('rejects amounts with more than 2 decimal places', () => {
    const result = validateParsedExpense({ ...VALID, amount: 12.345 })
    expect(isParseRejection(result)).toBe(true)
  })

  it('accepts a bare 3-digit retail amount at face value — the F5 fix', () => {
    // "450 at the grocery store" must resolve to 450, never a silent
    // divide-by-100 to 4.50 (audit 02-F5 / fix-plan item 1.7).
    const result = validateParsedExpense({ ...VALID, amount: 450 })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) expect(result.amount).toBe(450)
  })

  it('accepts amounts with exactly 2 decimal places, tolerating float representation', () => {
    const result = validateParsedExpense({ ...VALID, amount: 19.99 })
    expect(isParseRejection(result)).toBe(false)
  })
})

describe('deriveDirectionFromFlowType — the model classifies intent; code decides the sign', () => {
  it.each([
    ['expense', 'debit'],
    ['transfer_out', 'debit'],
    ['income', 'credit'],
    ['transfer_in', 'credit'],
    ['refund', 'credit'],
    ['reimbursement', 'credit'],
  ] as const)('maps flow_type %s to direction %s', (flowType, expectedDirection) => {
    expect(deriveDirectionFromFlowType(flowType)).toBe(expectedDirection)
  })

  it('FLOW_TYPE_VALUES enumerates exactly the six flow types, each mapped', () => {
    expect([...FLOW_TYPE_VALUES].sort()).toEqual(
      ['expense', 'income', 'refund', 'reimbursement', 'transfer_in', 'transfer_out'].sort(),
    )
  })
})

describe('validateParsedExpense — flow_type → direction derivation', () => {
  it.each([
    ['expense', 'debit'],
    ['transfer_out', 'debit'],
    ['income', 'credit'],
    ['transfer_in', 'credit'],
    ['refund', 'credit'],
    ['reimbursement', 'credit'],
  ] as const)('flow_type %s derives direction %s end-to-end through the validator', (flowType, expectedDirection) => {
    const result = validateParsedExpense({ ...VALID, flow_type: flowType })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) {
      expect(result.flow_type).toBe(flowType)
      expect(result.direction).toBe(expectedDirection)
    }
  })

  it('rejects a flow_type outside the enum, e.g. the old direction value "debit" itself', () => {
    // "debit"/"credit" were the old (removed) direction enum's values —
    // they are not valid flow_type values, and must not be silently
    // reinterpreted as one.
    const result = validateParsedExpense({ ...VALID, flow_type: 'debit' })
    expect(isParseRejection(result)).toBe(true)
    if (isParseRejection(result)) {
      expect(result.errors.some((e) => e.field === 'flow_type')).toBe(true)
    }
  })

  it('resolves "investing $300 at Schwab" style output as transfer_out → debit, not defaulted', () => {
    // The prompt already carries the Schwab sentence as a worked example
    // (prompt.ts) — this pins the validator's side of that contract: a
    // model that correctly returns flow_type: 'transfer_out' must derive
    // direction 'debit', never silently flipped or defaulted to income.
    const result = validateParsedExpense({
      ...VALID,
      amount: 300,
      flow_type: 'transfer_out',
      merchant: 'Charles Schwab',
      note: 'S&P 500',
      is_recurring_suggestion: true,
      recurring_frequency_suggestion: 'monthly',
    })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) {
      expect(result.flow_type).toBe('transfer_out')
      expect(result.direction).toBe('debit')
    }
  })

  it('resolves "I sold $300 of my S&P 500 index fund" style output as transfer_in → credit', () => {
    const result = validateParsedExpense({
      ...VALID,
      amount: 300,
      flow_type: 'transfer_in',
      merchant: 'Charles Schwab',
      note: 'S&P 500',
    })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) {
      expect(result.flow_type).toBe('transfer_in')
      expect(result.direction).toBe('credit')
    }
  })
})

describe('validateParsedExpense — currency', () => {
  it('rejects a non-ISO-4217 string ("dollars")', () => {
    expect(isParseRejection(validateParsedExpense({ ...VALID, currency: 'dollars' }))).toBe(true)
  })

  it('rejects a 3-letter string that looks like a code but is not one ("XYZ")', () => {
    expect(isParseRejection(validateParsedExpense({ ...VALID, currency: 'XYZ' }))).toBe(true)
  })

  it('accepts real ISO 4217 codes beyond the majors', () => {
    expect(isParseRejection(validateParsedExpense({ ...VALID, currency: 'XOF' }))).toBe(false)
    expect(isParseRejection(validateParsedExpense({ ...VALID, currency: 'NGN' }))).toBe(false)
  })
})

describe('validateParsedExpense — confidence (clamped, never a rejection reason)', () => {
  it('clamps confidence above 1 down to 1', () => {
    const result = validateParsedExpense({ ...VALID, confidence: 1.4 })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) expect(result.confidence).toBe(1)
  })

  it('clamps negative confidence up to 0', () => {
    const result = validateParsedExpense({ ...VALID, confidence: -0.3 })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) expect(result.confidence).toBe(0)
  })

  it('defaults a missing/non-numeric confidence to 0.5', () => {
    const result = validateParsedExpense({ ...VALID, confidence: 'high' })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) expect(result.confidence).toBe(0.5)
  })
})

describe('validateParsedExpense — transacted_at', () => {
  it('rejects an unparseable date string', () => {
    expect(isParseRejection(validateParsedExpense({ ...VALID, transacted_at: 'yesterday-ish' }))).toBe(true)
  })

  it('rejects a missing transacted_at', () => {
    const { transacted_at, ...withoutDate } = VALID
    void transacted_at
    expect(isParseRejection(validateParsedExpense(withoutDate))).toBe(true)
  })

  it('accepts a parseable ISO instant', () => {
    expect(isParseRejection(validateParsedExpense({ ...VALID, transacted_at: '2026-08-08T14:39:14Z' }))).toBe(false)
  })
})

describe('validateParsedExpense — note length cap', () => {
  it('truncates a note longer than the default cap instead of rejecting', () => {
    const longNote = 'x'.repeat(DEFAULT_MAX_NOTE_LENGTH + 250)
    const result = validateParsedExpense({ ...VALID, note: longNote })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) {
      expect(result.note?.length).toBe(DEFAULT_MAX_NOTE_LENGTH)
    }
  })

  it('honors a custom maxNoteLength option', () => {
    const result = validateParsedExpense({ ...VALID, note: 'a fairly short note' }, { maxNoteLength: 5 })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) expect(result.note).toBe('a fai')
  })

  it('keeps a null note as null', () => {
    const result = validateParsedExpense({ ...VALID, note: null })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) expect(result.note).toBeNull()
  })
})

describe('validateParsedExpense — recurring_frequency_suggestion', () => {
  it('rejects a value outside the frequency enum', () => {
    const result = validateParsedExpense({
      ...VALID,
      is_recurring_suggestion: true,
      recurring_frequency_suggestion: 'fortnightly',
    })
    expect(isParseRejection(result)).toBe(true)
  })

  it('drops a frequency when is_recurring_suggestion is false, rather than trusting the model to keep them consistent', () => {
    const result = validateParsedExpense({
      ...VALID,
      is_recurring_suggestion: false,
      recurring_frequency_suggestion: 'monthly',
    })
    expect(isParseRejection(result)).toBe(false)
    if (!isParseRejection(result)) expect(result.recurring_frequency_suggestion).toBeNull()
  })
})

describe('validateParsedExpense — root shape', () => {
  it('rejects a non-object payload (array)', () => {
    expect(isParseRejection(validateParsedExpense([1, 2, 3]))).toBe(true)
  })

  it('rejects null', () => {
    expect(isParseRejection(validateParsedExpense(null))).toBe(true)
  })

  it('rejects a raw string', () => {
    expect(isParseRejection(validateParsedExpense('not json'))).toBe(true)
  })
})

describe('validateTransactionWriteFields — the third boundary (createTransaction)', () => {
  const VALID_WRITE = {
    amount: 42.5,
    direction: 'debit' as const,
    currency_code: 'USD',
    payment_method: 'credit_card' as const,
  }

  it('accepts a fully valid write with no errors', () => {
    expect(validateTransactionWriteFields(VALID_WRITE)).toBeNull()
  })

  it('accepts a null/omitted payment_method — it is genuinely nullable on every write path', () => {
    expect(validateTransactionWriteFields({ ...VALID_WRITE, payment_method: null })).toBeNull()
    const { payment_method: _pm, ...withoutPaymentMethod } = VALID_WRITE
    void _pm
    expect(validateTransactionWriteFields(withoutPaymentMethod)).toBeNull()
  })

  // The fix-plan's own worked rejection example, replayed against the third
  // boundary rather than the full ParsedExpense contract — this is the
  // "assert createTransaction refuses all four" half of item 1.7's
  // regression-test line: 'direction: "expense"' and 'payment_method:
  // "venmo"' must never reach a local SQLite write, exactly as they must
  // never reach a save from the AI routes.
  it('rejects direction: "expense" (not in the debit/credit enum)', () => {
    const errors = validateTransactionWriteFields({ ...VALID_WRITE, direction: 'expense' as never })
    expect(errors).not.toBeNull()
    expect(errors?.some((e) => e.field === 'direction')).toBe(true)
  })

  it('rejects payment_method: "venmo" (not a DB enum value)', () => {
    const errors = validateTransactionWriteFields({ ...VALID_WRITE, payment_method: 'venmo' as never })
    expect(errors).not.toBeNull()
    expect(errors?.some((e) => e.field === 'payment_method')).toBe(true)
  })

  it('rejects currency: "dollars" (not an ISO 4217 code)', () => {
    const errors = validateTransactionWriteFields({ ...VALID_WRITE, currency_code: 'dollars' })
    expect(errors).not.toBeNull()
    expect(errors?.some((e) => e.field === 'currency')).toBe(true)
  })

  it('rejects a non-finite/zero/negative amount, same rule as the full contract', () => {
    expect(validateTransactionWriteFields({ ...VALID_WRITE, amount: 0 })?.some((e) => e.field === 'amount')).toBe(true)
    expect(validateTransactionWriteFields({ ...VALID_WRITE, amount: NaN })?.some((e) => e.field === 'amount')).toBe(true)
    expect(validateTransactionWriteFields({ ...VALID_WRITE, amount: -5 })?.some((e) => e.field === 'amount')).toBe(true)
  })

  it('collects every failing field in one pass, all four at once', () => {
    const errors = validateTransactionWriteFields({
      amount: -1,
      direction: 'expense' as never,
      currency_code: 'dollars',
      payment_method: 'venmo' as never,
    })
    expect(errors?.map((e) => e.field).sort()).toEqual(['amount', 'currency', 'direction', 'payment_method'])
  })
})

describe('assertParsedExpense — throwing wrapper', () => {
  it('returns the validated value on success', () => {
    expect(assertParsedExpense(VALID).amount).toBe(42.5)
  })

  it('throws ParseValidationError with the field errors attached on failure', () => {
    let caught: unknown
    try {
      assertParsedExpense({ flow_type: 'expensive', payment_method: 'venmo' })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ParseValidationError)
    const err = caught as ParseValidationError
    expect(err.errors.length).toBeGreaterThan(0)
    expect(err.errors.some((e) => e.field === 'flow_type')).toBe(true)
    expect(err.errors.some((e) => e.field === 'payment_method')).toBe(true)
  })
})
