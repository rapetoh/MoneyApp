/**
 * `voiceexpense://shortcut?…` (iOS Shortcuts) — the query → bridge-params
 * contract consumed by `/(tabs)/record`. The URL → route half is Expo
 * Router's (`app/shortcut.tsx`); this covers the validation that used to
 * live in `useShortcutHandler.parseShortcutUrl` (fix-plan 3.4 / audit
 * 07-F19), preserved verbatim so already-installed Shortcuts keep working.
 */
import { describe, expect, it } from 'vitest'
import { shortcutRouteParams } from '../shortcutLink'

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
    expect(shortcutRouteParams({ amount: ['7', '9'], merchant: ['A', 'B'] })?.shortcut_amount).toBe('7')
  })

  it('returns null without a positive amount — the caller falls back to Today', () => {
    expect(shortcutRouteParams({})).toBeNull()
    expect(shortcutRouteParams({ amount: '0' })).toBeNull()
    expect(shortcutRouteParams({ amount: '-3' })).toBeNull()
    expect(shortcutRouteParams({ amount: 'abc' })).toBeNull()
  })
})
