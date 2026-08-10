// Unit tests for the scan rejection state — fix-plan item 2.9c (audit
// 02-F3): "a scan the model *rejects* still opens a savable editor
// pre-armed as recurring income." `parseScan` used to return a plain
// `ParsedExpense` even when the model itself set `needs_clarification`
// (the scan prompts' only use of that field is "the image isn't usable"
// — see prompt.ts's `getScanPrompt`), so the caller had no way to tell
// "here's a receipt, low confidence" apart from "this isn't a receipt at
// all" and opened the confirm sheet either way.
//
// These tests exercise the real `parseScan()` with `fetch` mocked, the
// same pattern goldenCorpus.test.ts uses for `parseExpense()`.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { parseScan } from '../scanParser'
import { ParseValidationError } from '../validateParsedExpense'

const VALID_RECEIPT: Record<string, unknown> = {
  amount: 42.5,
  currency: 'USD',
  flow_type: 'expense',
  merchant: 'Trader Joe\'s',
  merchant_domain: null,
  note: null,
  category_suggestion: 'Groceries',
  payment_method: 'credit_card',
  transacted_at: '2026-08-09T14:00:00.000Z',
  confidence: 0.9,
  needs_clarification: false,
  clarifying_question: null,
  is_recurring_suggestion: false,
  recurring_frequency_suggestion: null,
}

function mockFetchReturning(status: number, body: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    ),
  )
}

function opts(scanType: 'receipt' | 'paycheck' = 'receipt') {
  return {
    imageBase64: 'base64==',
    scanType,
    currency: 'USD',
    apiBaseUrl: 'https://example.test',
    authToken: 'test-token',
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseScan — ok: true', () => {
  it('returns { ok: true, expense } for a valid, non-ambiguous scan', async () => {
    mockFetchReturning(200, VALID_RECEIPT)
    const result = await parseScan(opts('receipt'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expense.amount).toBe(42.5)
    expect(result.expense.merchant).toBe('Trader Joe\'s')
  })
})

describe('parseScan — ok: false (the F3 fix)', () => {
  it('a receipt the model flags as unreadable comes back as a rejection, not an editable expense', async () => {
    // `amount` is a required positive number in PARSED_EXPENSE_JSON_SCHEMA
    // (the model cannot literally return 0/null for it), so an unreadable
    // image realistically comes back as a placeholder-looking amount
    // alongside needs_clarification: true — exactly the shape that used to
    // sail straight into a savable, pre-filled editor (audit 02-F3).
    mockFetchReturning(200, {
      ...VALID_RECEIPT,
      amount: 0.01,
      needs_clarification: true,
      clarifying_question: 'This image is too blurry to read as a receipt.',
    })
    const result = await parseScan(opts('receipt'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('This image is too blurry to read as a receipt.')
  })

  it('a paycheck scan of something that is not a paycheck is rejected, not opened pre-armed as recurring income', async () => {
    mockFetchReturning(200, {
      ...VALID_RECEIPT,
      flow_type: 'income',
      category_suggestion: 'Income',
      is_recurring_suggestion: true,
      recurring_frequency_suggestion: 'biweekly',
      needs_clarification: true,
      clarifying_question: null,
    })
    const result = await parseScan(opts('paycheck'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    // No clarifying_question from the model — falls back to the honest
    // scan-type-specific default rather than a blank/generic message.
    expect(result.reason).toBe("That doesn't look like a paycheck.")
  })

  it('falls back to a receipt-specific default reason when the model sets needs_clarification with no question text', async () => {
    mockFetchReturning(200, { ...VALID_RECEIPT, needs_clarification: true, clarifying_question: null })
    const result = await parseScan(opts('receipt'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("That doesn't look like a receipt.")
  })
})

describe('parseScan — still throws on a boundary violation, distinct from a model rejection', () => {
  it('a 422 (validateParsedExpense already rejected it server-side) throws ParseValidationError', async () => {
    mockFetchReturning(422, { errors: [{ field: 'amount', message: 'expected a finite number, got null' }] })
    await expect(parseScan(opts('receipt'))).rejects.toBeInstanceOf(ParseValidationError)
  })

  it('a malformed 200 response (fails the client-side boundary too) throws, not { ok: false }', async () => {
    mockFetchReturning(200, { ...VALID_RECEIPT, amount: -5 })
    await expect(parseScan(opts('receipt'))).rejects.toBeInstanceOf(ParseValidationError)
  })
})
