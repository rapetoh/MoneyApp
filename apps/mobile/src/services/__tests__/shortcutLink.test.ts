/**
 * `voiceexpense://shortcut?…` (iOS Shortcuts) — the query → bridge-params
 * contract consumed by `/(tabs)/record`. The URL → route half is Expo
 * Router's (`app/shortcut.tsx`); this covers the validation that used to
 * live in `useShortcutHandler.parseShortcutUrl` (fix-plan 3.4 / audit
 * 07-F19), preserved verbatim so already-installed Shortcuts keep working.
 */
import { describe, expect, it } from 'vitest'
import { shortcutRouteParams, parseShortcutAmount, inferShortcutCurrency } from '../shortcutLink'

describe('shortcutRouteParams', () => {
  it('shapes the query a real iOS Shortcut emits into the bridge params', () => {
    expect(
      shortcutRouteParams({
        amount: '4.50',
        merchant: 'Starbucks',
        currency: 'USD',
        payment_method: 'digital_wallet',
      }),
    ).toEqual({
      shortcut_amount: '4.5',
      shortcut_merchant: 'Starbucks',
      shortcut_currency: 'USD',
      shortcut_payment_method: 'digital_wallet',
    })
  })

  it('defaults payment_method to digital_wallet and merchant/currency to empty string when omitted', () => {
    expect(shortcutRouteParams({ amount: '12' })).toEqual({
      shortcut_amount: '12',
      shortcut_merchant: '',
      shortcut_currency: '',
      shortcut_payment_method: 'digital_wallet',
    })
  })

  it('takes the first value when Expo Router hands back an array', () => {
    expect(shortcutRouteParams({ amount: ['7', '9'], merchant: ['A', 'B'] })?.shortcut_amount).toBe(
      '7',
    )
  })

  it('returns null without a positive amount — the caller falls back to Today', () => {
    expect(shortcutRouteParams({})).toBeNull()
    expect(shortcutRouteParams({ amount: '0' })).toBeNull()
    expect(shortcutRouteParams({ amount: '-3' })).toBeNull()
    expect(shortcutRouteParams({ amount: 'abc' })).toBeNull()
  })
})

describe('parseShortcutAmount — what Wallet actually hands a Shortcut (Aug 17 2026)', () => {
  it.each([
    ['$2.11', 2.11],
    ['2.11', 2.11],
    ['$1,234.56', 1234.56],
    ['1,234', 1234],
    ['€2,11', 2.11],
    ['2,11 €', 2.11],
    ['1.234,56 €', 1234.56],
    ['CHF 12.50', 12.5],
    ['CA$ 8.00', 8],
    ['12', 12],
    ['0,5', 0.5],
  ])('%s → %s', (raw, expected) => {
    expect(parseShortcutAmount(raw)).toBe(expected)
  })
  it('rejects empty / non-numeric / zero / refunds (negative)', () => {
    expect(parseShortcutAmount('')).toBeNull()
    expect(parseShortcutAmount('free')).toBeNull()
    expect(parseShortcutAmount('$0.00')).toBeNull()
    expect(parseShortcutAmount('−$4.50')).toBeNull()
    expect(parseShortcutAmount('-4.50')).toBeNull()
    expect(parseShortcutAmount('($4.50)')).toBeNull()
  })
})

describe('inferShortcutCurrency', () => {
  it('prefers the explicit currency, else the symbol, else empty', () => {
    expect(inferShortcutCurrency('$2.11', 'USD')).toBe('USD')
    expect(inferShortcutCurrency('$2.11', '')).toBe('USD')
    expect(inferShortcutCurrency('2,11 €', '')).toBe('EUR')
    expect(inferShortcutCurrency('£3', '')).toBe('GBP')
    expect(inferShortcutCurrency('2.11', '')).toBe('')
  })
})

describe('shortcutRouteParams with a real Wallet amount', () => {
  it('the owner\'s Aug 17 tap: "$2.11" at Three Square Market Vending reaches the bridge', () => {
    expect(
      shortcutRouteParams({
        amount: '$2.11',
        merchant: 'Three Square Market Vending, Cedar Rapids',
        currency: 'USD',
        payment_method: 'digital_wallet',
      }),
    ).toEqual({
      shortcut_amount: '2.11',
      shortcut_merchant: 'Three Square Market Vending, Cedar Rapids',
      shortcut_currency: 'USD',
      shortcut_payment_method: 'digital_wallet',
    })
  })
})
