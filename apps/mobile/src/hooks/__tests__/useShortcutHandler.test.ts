/**
 * Regression test for fix-plan 3.4 / audit 07-F19, 02-F34, 08-F19: the iOS
 * Shortcuts deep link could never fire because `parseShortcutUrl` matched
 * on `path` alone, and `expo-linking`'s `parse()` (built on `new URL(...)`)
 * puts `shortcut` in `hostname`, not `path`, for a two-slash custom-scheme
 * URL — exactly the shape a real iOS Shortcut emits.
 *
 * `expo-linking` is mocked with the same `new URL(...)`-based logic its
 * own native `parse()` uses (see node_modules/expo-linking/build/createURL.js)
 * so this test exercises the real parsing shape without pulling in
 * `expo-constants`'s native dependency chain.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-linking', () => ({
  parse: (url: string) => {
    try {
      const parsed = new URL(url)
      const queryParams: Record<string, string> = {}
      parsed.searchParams.forEach((value, key) => {
        queryParams[key] = value
      })
      return {
        hostname: parsed.hostname || null,
        path: parsed.pathname || null,
        queryParams,
      }
    } catch {
      return { hostname: null, path: url, queryParams: {} }
    }
  },
  getInitialURL: vi.fn(async () => null),
  addEventListener: vi.fn(() => ({ remove: () => {} })),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const { parseShortcutUrl } = await import('../useShortcutHandler')

describe('parseShortcutUrl', () => {
  it('parses the exact URL an iOS Shortcut emits (audit 07-F19)', () => {
    // `//` after the scheme puts "shortcut" in hostname, not path — this
    // is the shape that used to be silently rejected.
    const result = parseShortcutUrl(
      'voiceexpense://shortcut?amount=4.50&merchant=Starbucks&currency=USD&payment_method=digital_wallet',
    )
    expect(result).toEqual({
      shortcut_amount: '4.5',
      shortcut_merchant: 'Starbucks',
      shortcut_currency: 'USD',
      shortcut_payment_method: 'digital_wallet',
    })
  })

  it('defaults payment_method to digital_wallet and merchant/currency to empty string when omitted', () => {
    const result = parseShortcutUrl('voiceexpense://shortcut?amount=12')
    expect(result).toEqual({
      shortcut_amount: '12',
      shortcut_merchant: '',
      shortcut_currency: '',
      shortcut_payment_method: 'digital_wallet',
    })
  })

  it('rejects a non-shortcut host', () => {
    expect(parseShortcutUrl('voiceexpense://something-else?amount=5')).toBeNull()
  })

  it('rejects a missing, non-numeric, or non-positive amount', () => {
    expect(parseShortcutUrl('voiceexpense://shortcut')).toBeNull()
    expect(parseShortcutUrl('voiceexpense://shortcut?amount=abc')).toBeNull()
    expect(parseShortcutUrl('voiceexpense://shortcut?amount=0')).toBeNull()
    expect(parseShortcutUrl('voiceexpense://shortcut?amount=-5')).toBeNull()
  })

  it('rejects a URL that fails to parse at all', () => {
    expect(parseShortcutUrl('not a url')).toBeNull()
  })
})
