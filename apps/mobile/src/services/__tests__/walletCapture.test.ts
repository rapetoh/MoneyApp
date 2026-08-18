/**
 * Apple Pay capture — the pure normalisation step between a queued entry
 * (native App Intent or deep link) and `createTransaction`.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-file-system', () => ({ File: class {}, Paths: { document: '/tmp' } }))

import { normaliseCapture } from '../walletCapture'

const base = { id: 'x', source: 'shortcut' as const, captured_at: '2026-08-17T05:12:00Z' }

describe('normaliseCapture', () => {
  it("the owner's real tap: $2.11 at Three Square Market → 2.11 USD", () => {
    expect(
      normaliseCapture(
        {
          ...base,
          amount: '$2.11',
          merchant: 'Three Square Market Vending, Cedar Rapids',
          currency: '',
        },
        'USD',
      ),
    ).toEqual({
      id: 'x',
      amount: 2.11,
      currency: 'USD',
      merchant: 'Three Square Market Vending, Cedar Rapids',
      capturedAt: '2026-08-17T05:12:00Z',
    })
  })
  it('explicit currency wins; symbol next; profile last', () => {
    expect(
      normaliseCapture({ ...base, amount: '2.11', merchant: 'A', currency: 'eur' }, 'USD')
        ?.currency,
    ).toBe('EUR')
    expect(
      normaliseCapture({ ...base, amount: '2,11 €', merchant: 'A', currency: '' }, 'USD')?.currency,
    ).toBe('EUR')
    expect(
      normaliseCapture({ ...base, amount: '2.11', merchant: 'A', currency: '' }, 'GBP')?.currency,
    ).toBe('GBP')
    expect(
      normaliseCapture({ ...base, amount: '2.11', merchant: 'A', currency: 'dollars' }, 'GBP')
        ?.currency,
    ).toBe('GBP')
  })
  it('refunds and junk are dropped; blank merchant becomes null; bad timestamps fall back to now', () => {
    expect(
      normaliseCapture({ ...base, amount: '-$4.50', merchant: 'A', currency: '' }, 'USD'),
    ).toBeNull()
    expect(
      normaliseCapture({ ...base, amount: 'free', merchant: 'A', currency: '' }, 'USD'),
    ).toBeNull()
    const n = normaliseCapture(
      { ...base, amount: '$3', merchant: '   ', currency: '', captured_at: 'nope' },
      'USD',
    )
    expect(n?.merchant).toBeNull()
    expect(Number.isFinite(Date.parse(n!.capturedAt))).toBe(true)
  })
})
