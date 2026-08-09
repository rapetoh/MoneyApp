import { describe, it, expect } from 'vitest'
import {
  roundCents,
  formatMoney,
  formatMoneyParts,
  formatCurrency,
  currencySymbolFor,
} from '../currency'

describe('roundCents — half-away-from-zero (05-F32)', () => {
  // 0.125 (an eighth) is exactly representable in IEEE-754 double
  // precision, and so is its ×100 product (12.5) — unlike a "natural"
  // half-cent literal such as 1.005, which 05-F32 itself notes is
  // *not* exactly representable (`1.005` is actually stored as
  // `1.00499999999999989...`) and so is not a reliable fixture for
  // pinning rounding-mode behaviour. Using an exact value isolates
  // the thing under test — `Math.round`'s sign asymmetry — from
  // decimal-to-binary representation noise, which is a separate,
  // already-documented class of float imprecision this function does
  // not claim to fix.
  it('rounds a positive half-cent up', () => {
    expect(roundCents(0.125)).toBe(0.13)
  })

  it('rounds a negative half-cent away from zero, not toward +Infinity', () => {
    // Math.round(-12.5) === -12 in JS (rounds toward +Infinity, i.e.
    // half-up, not half-away-from-zero). Money rounding must produce
    // -0.13 here, matching toFixed/Intl's halfExpand behaviour.
    expect(roundCents(-0.125)).toBe(-0.13)
  })

  it('is a no-op on an already-2-decimal value', () => {
    expect(roundCents(92)).toBe(92)
    expect(roundCents(-92.5)).toBe(-92.5)
  })
})

describe('formatMoney — locale is required (07-F30)', () => {
  it('formats USD/en with the expected symbol and grouping', () => {
    expect(formatMoney(1234.5, 'USD', 'en-US')).toBe('$1,234.50')
  })

  it('formats EUR/fr with French grouping/decimal conventions', () => {
    const out = formatMoney(1234.5, 'EUR', 'fr-FR')
    // French uses a non-breaking/narrow space group separator and a
    // comma decimal — assert on content, not exact whitespace bytes.
    expect(out.replace(/\s/g, ' ')).toMatch(/1.234,50.*€|€.*1.234,50/)
  })

  it('formats JPY with the yen symbol — this app always shows 2 decimals regardless of currency, matching the numeric(14,2) columns every amount is stored in', () => {
    // en-US, not ja-JP: the ja-JP locale renders the fullwidth yen
    // sign (U+FFE5, "￥") rather than the common halfwidth glyph
    // (U+00A5, "¥") — a locale-glyph detail, not something this
    // function should special-case.
    const out = formatMoney(1234, 'JPY', 'en-US')
    expect(out).toContain('¥')
    expect(out).toContain('.00')
  })

  it('compact precision is available for chart axes', () => {
    const out = formatMoney(1250, 'USD', 'en-US', { precision: 'compact' })
    expect(out.length).toBeLessThan(formatMoney(1250, 'USD', 'en-US').length)
  })
})

describe('formatMoneyParts', () => {
  it('splits USD into sign/symbol/integer/decimal/fraction', () => {
    const parts = formatMoneyParts(1234.56, 'USD', 'en-US')
    expect(parts.sign).toBe('')
    expect(parts.symbol).toBe('$')
    expect(parts.symbolFirst).toBe(true)
    expect(parts.integer).toBe('1,234')
    expect(parts.decimal).toBe('.')
    expect(parts.fraction).toBe('56')
  })

  it('marks the sign separately for a negative amount, without a leading "-" in integer', () => {
    const parts = formatMoneyParts(-92, 'USD', 'en-US')
    expect(parts.sign).toBe('-')
    expect(parts.integer).toBe('92')
  })
})

describe('formatCurrency — deprecated back-compat wrapper', () => {
  it('still defaults to "en" for the callers Stage 2 has not migrated yet', () => {
    expect(formatCurrency(92, 'USD')).toBe(formatMoney(92, 'USD', 'en'))
  })
})

describe('currencySymbolFor — unchanged, still used directly by mobile call sites', () => {
  it('covers every currency the app offers', () => {
    expect(currencySymbolFor('USD')).toBe('$')
    expect(currencySymbolFor('NGN')).toBe('₦')
    expect(currencySymbolFor('XAF')).toBe('CFA ')
  })
})
