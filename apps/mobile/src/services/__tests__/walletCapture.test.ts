/**
 * Apple Pay capture — the pure normalisation step between a queued entry
 * (native App Intent or deep link) and `createTransaction`.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-file-system', () => ({ File: class {}, Paths: { document: '/tmp' } }))

import { normaliseCapture, normaliseSpoken, spokenTranscript } from '../walletCapture'

const base = {
  id: 'x',
  kind: 'wallet' as const,
  phrase: '',
  hint: '' as const,
  source: 'shortcut' as const,
  captured_at: '2026-08-17T05:12:00Z',
}

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

/**
 * Siri's half: a sentence in, the four fields `createTransaction` needs
 * out. The parser is mocked by hand here because the point is what
 * happens around it, especially when it is not there at all.
 */
describe('normaliseSpoken', () => {
  const TZ = 'America/Chicago'
  // Sunday 20 Sep 2026, 20:15 in Chicago.
  const NOW = '2026-09-21T01:15:00.000Z'
  const spoken = (phrase: string, hint: 'expense' | 'income' = 'expense') => ({
    ...base,
    kind: 'phrase' as const,
    phrase,
    hint,
    amount: '',
    merchant: '',
    currency: '',
  })

  it('takes the parser at its word when it answered', () => {
    expect(
      normaliseSpoken(
        spoken('five dollars at Walmart'),
        { amount: 5, currency: 'USD', merchant: ' Walmart ', transacted_at: '2026-09-20T17:04:00Z' },
        'EUR',
        TZ,
        NOW,
      ),
    ).toEqual({
      amount: 5,
      currency: 'USD',
      merchant: 'Walmart',
      transactedAt: '2026-09-20T17:04:00Z',
    })
  })

  it('reads the amount out of the words when the parser never came back', () => {
    // Offline at the till: the sentence still has to become a row.
    expect(normaliseSpoken(spoken('$12.40 at Starbucks'), null, 'USD', TZ, NOW)).toEqual({
      amount: 12.4,
      currency: 'USD',
      merchant: null,
      transactedAt: base.captured_at,
    })
  })

  it('falls back to the profile currency when nothing names one', () => {
    // Regression: `inferShortcutCurrency` answers '' rather than null, so
    // a `??` chain here wrote an empty currency_code and the write
    // validator rejected the row. Every Siri entry outside the dollar and
    // euro zones would have failed to save.
    expect(normaliseSpoken(spoken('4000 at Ramco'), null, 'XOF', TZ, NOW)?.currency).toBe('XOF')
    expect(normaliseSpoken(spoken('4000 at Ramco'), { amount: 4000, currency: '' }, 'XOF', TZ, NOW)?.currency).toBe('XOF')
  })

  it('keeps the symbol the speaker used over the profile currency', () => {
    expect(normaliseSpoken(spoken('€8 at Monoprix'), null, 'USD', TZ, NOW)?.currency).toBe('EUR')
  })

  it('refuses to invent an amount', () => {
    expect(normaliseSpoken(spoken('something at Walmart'), null, 'USD', TZ, NOW)).toBeNull()
    expect(normaliseSpoken(spoken('zero dollars'), { amount: 0 }, 'USD', TZ, NOW)).toBeNull()
    expect(normaliseSpoken(spoken('minus five'), { amount: -5 }, 'USD', TZ, NOW)).toBeNull()
  })

  it('files a dateless sentence at the moment Siri heard it', () => {
    // Build 64, on the owner's phone: the parser answers "today" as
    // midnight UTC, which renders as the previous evening in Chicago, so
    // both Siri entries landed on Saturday at 7pm. Null back from the
    // repair means "no real date was said".
    const entry = { ...spoken('five dollars at Target'), captured_at: NOW }
    const out = normaliseSpoken(entry, { amount: 5, transacted_at: '2026-09-20T00:00:00Z' }, 'USD', TZ, NOW)
    expect(out?.transactedAt).toBe(NOW)
  })

  it('keeps a date the speaker actually named, at midday local', () => {
    const entry = { ...spoken('forty dollars at Shell on Friday'), captured_at: NOW }
    const out = normaliseSpoken(entry, { amount: 40, transacted_at: '2026-09-18T00:00:00Z' }, 'USD', TZ, NOW)
    // Midday in Chicago, not midnight UTC: the row lands on Friday.
    expect(out?.transactedAt).toBe('2026-09-18T17:00:00.000Z')
  })

  it('keeps a full instant untouched', () => {
    const entry = { ...spoken('nine dollars at Dunkin'), captured_at: NOW }
    const out = normaliseSpoken(entry, { amount: 9, transacted_at: '2026-09-19T14:32:00.000Z' }, 'USD', TZ, NOW)
    expect(out?.transactedAt).toBe('2026-09-19T14:32:00.000Z')
  })

  it('tells the parser which door the sentence came through', () => {
    // "Two hundred from Acme" is income or a payment out depending on
    // which Siri phrase was used; the words alone cannot say.
    expect(spokenTranscript(spoken('two hundred from Acme', 'income'), 'en')).toBe(
      'Income received: two hundred from Acme',
    )
    expect(spokenTranscript(spoken('two hundred from Acme', 'income'), 'fr')).toBe(
      'Revenu reçu : two hundred from Acme',
    )
    // An expense, a Wallet capture and an unknown locale all pass through.
    expect(spokenTranscript(spoken('five at Target'), 'en')).toBe('five at Target')
    expect(spokenTranscript({ ...base, amount: '$2.11', merchant: 'Shell', currency: '' }, 'en')).toBe('')
    expect(spokenTranscript(spoken('two hundred from Acme', 'income'), 'de')).toBe(
      'Income received: two hundred from Acme',
    )
  })
})
