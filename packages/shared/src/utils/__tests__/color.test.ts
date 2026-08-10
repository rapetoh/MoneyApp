import { describe, it, expect } from 'vitest'
import { merchantColor, guessDomain, categoryPalette, contrastRatio, KNOWN_DOMAINS } from '../color'

// The 20 seeded `default_categories` colors (supabase/migrations/
// 004_default_categories.sql) plus a pure-gray edge case — the real
// inputs `categoryPalette` has to hold up against, not synthetic ones.
const SEEDED_CATEGORY_COLORS = [
  '#4CAF50',
  '#FF6B35',
  '#4A90E2',
  '#9B59B6',
  '#E74C3C',
  '#27AE60',
  '#8B6914',
  '#607D8B',
  '#F39C12',
  '#1ABC9C',
  '#E91E8C',
  '#2C3E50',
  '#E67E22',
  '#795548',
  '#546E7A',
  '#FF9800',
  '#37474F',
  '#00897B',
  '#757575',
  '#95A5A6',
]

describe('merchantColor — deterministic fallback-avatar palette (fix-plan 4.4 / 01-F28)', () => {
  it('is deterministic for the same name', () => {
    expect(merchantColor('Starbucks')).toBe(merchantColor('Starbucks'))
  })

  it('every palette entry clears 4.5:1 white-text contrast', () => {
    // Exercise enough distinct names to touch every palette slot at
    // least once (there are 8) rather than asserting on the array
    // directly — a change to the array without touching this test
    // should still be caught by *what the function actually returns*.
    const names = Array.from({ length: 200 }, (_, i) => `merchant-${i}`)
    const seen = new Set(names.map(merchantColor))
    expect(seen.size).toBeGreaterThan(1) // the hash is actually spreading
    for (const hex of seen) {
      expect(contrastRatio(hex, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('guessDomain', () => {
  it('resolves a known merchant via KNOWN_DOMAINS', () => {
    expect(guessDomain('Starbucks')).toBe('starbucks.com')
    expect(guessDomain(' McDonald\'s ')).toBe(KNOWN_DOMAINS.mcdonalds)
  })

  it('falls back to a stripped-and-lowercased .com guess', () => {
    expect(guessDomain('Joe’s Pizza')).toBe('joespizza.com')
  })
})

describe('categoryPalette — categories.color is the single source of truth (fix-plan 4.4 / 07-F26, 07-F27)', () => {
  it('is deterministic and cached for the same hex', () => {
    expect(categoryPalette('#4CAF50')).toEqual(categoryPalette('#4CAF50'))
  })

  it.each(SEEDED_CATEGORY_COLORS)('%s clears 4.5:1 for fg-on-bg and fg-on-white', (hex) => {
    const { bg, fg } = categoryPalette(hex)
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
    // fg-on-white matters too: it's reused as the merchant-avatar
    // fallback tile's solid background with white lettering, and as a
    // chart bar/line color drawn directly on a white card.
    expect(contrastRatio(fg, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps a near-gray category near-gray instead of injecting an arbitrary hue', () => {
    // #757575 (seeded "Fees & Charges") has zero saturation — the naive
    // version of this function (clamp saturation up to 45–68% before
    // checking `neutral`) sent it to h=0's fallback and rendered a
    // reddish-brown category, not a gray one.
    const { fg } = categoryPalette('#757575')
    const [r, g, b] = [fg.slice(1, 3), fg.slice(3, 5), fg.slice(5, 7)].map((h) => parseInt(h, 16))
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    expect(spread).toBeLessThan(20) // near-neutral, not a saturated hue
  })

  it('an arbitrary user-picked hex (not one of the 20 defaults) still clears 4.5:1', () => {
    // categories.color is user-editable via a color picker — nothing
    // constrains it to the seeded list. A pathological mid-lightness,
    // low-contrast pick like this one is exactly what a naive fixed-
    // lightness derivation would fail on.
    const { bg, fg } = categoryPalette('#B0B0A0')
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(fg, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })
})
