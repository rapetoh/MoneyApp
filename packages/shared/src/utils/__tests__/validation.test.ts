import { describe, it, expect } from 'vitest'
import { validateAmount, MAX_AMOUNT } from '../validation'

describe('validateAmount — fix-plan 2.14 (01-F1/01-F34)', () => {
  it('accepts a plain positive amount', () => {
    expect(validateAmount('12.50')).toEqual({ ok: true, amount: 12.5 })
  })

  it('accepts a bare integer', () => {
    expect(validateAmount('40')).toEqual({ ok: true, amount: 40 })
  })

  it('accepts a comma decimal separator', () => {
    expect(validateAmount('12,50')).toEqual({ ok: true, amount: 12.5 })
  })

  it('trims surrounding whitespace', () => {
    expect(validateAmount('  9.99  ')).toEqual({ ok: true, amount: 9.99 })
  })

  it('rejects an empty string distinctly from an invalid one', () => {
    expect(validateAmount('')).toEqual({ ok: false, reason: 'empty' })
    expect(validateAmount('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects non-numeric input', () => {
    expect(validateAmount('abc')).toEqual({ ok: false, reason: 'not_a_number' })
    expect(validateAmount('12.5.0')).toEqual({ ok: false, reason: 'not_a_number' })
    expect(validateAmount('-5')).toEqual({ ok: false, reason: 'not_a_number' })
  })

  it('rejects zero and negative amounts', () => {
    expect(validateAmount('0')).toEqual({ ok: false, reason: 'not_positive' })
    expect(validateAmount('0.00')).toEqual({ ok: false, reason: 'not_positive' })
  })

  it('rejects more than two decimal places — the divide-by-100-adjacent bug class this closes', () => {
    expect(validateAmount('12.999')).toEqual({ ok: false, reason: 'too_many_decimals' })
  })

  it('accepts exactly the numeric(14,2) ceiling and rejects one cent over it', () => {
    expect(validateAmount(String(MAX_AMOUNT))).toEqual({ ok: true, amount: MAX_AMOUNT })
    expect(validateAmount('10000000000.00')).toEqual({ ok: false, reason: 'too_large' })
  })

  it('is a pure function that never throws on garbage input', () => {
    expect(() => validateAmount('$$$')).not.toThrow()
    expect(() => validateAmount('NaN')).not.toThrow()
    expect(validateAmount('NaN')).toEqual({ ok: false, reason: 'not_a_number' })
  })
})
