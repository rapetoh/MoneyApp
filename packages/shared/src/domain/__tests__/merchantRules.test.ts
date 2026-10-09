import { describe, it, expect } from 'vitest'
import { merchantKey, merchantRuleName, learnedCategoryFor } from '../merchantRules'

describe('merchantKey', () => {
  it('one key however the bank spells the merchant', () => {
    expect(merchantKey('STARBUCKS #04412')).toBe('starbucks')
    expect(merchantKey('Starbucks')).toBe('starbucks')
    expect(merchantKey('SQ *STARBUCKS')).toBe('starbucks')
    expect(merchantKey("McDonald's F12345")).toBe('mcdonalds')
  })

  it('accents and punctuation do not split a merchant', () => {
    expect(merchantKey('Café Olé')).toBe(merchantKey('CAFE OLE'))
    expect(merchantKey('Chick-fil-A')).toBe('chickfila')
  })

  it('nothing identifying is no key', () => {
    expect(merchantKey(null)).toBeNull()
    expect(merchantKey('')).toBeNull()
    expect(merchantKey('***')).toBeNull()
  })
})

describe('merchantRuleName', () => {
  it('reads like a business, not a descriptor', () => {
    expect(merchantRuleName('STARBUCKS #04412')).toBe('Starbucks')
  })
})

describe('learnedCategoryFor', () => {
  const rules = [{ merchant_key: 'starbucks', merchant_name: 'Starbucks', category_id: 'coffee' }]

  it('files a known merchant in its learned category', () => {
    expect(learnedCategoryFor('STARBUCKS #9', rules)).toBe('coffee')
  })

  it('an unknown merchant has no learned category', () => {
    expect(learnedCategoryFor('Target', rules)).toBeNull()
    expect(learnedCategoryFor(null, rules)).toBeNull()
  })

  it('ignores a rule whose category is no longer listed', () => {
    expect(learnedCategoryFor('Starbucks', rules, new Set(['food']))).toBeNull()
    expect(learnedCategoryFor('Starbucks', rules, new Set(['coffee']))).toBe('coffee')
  })
})
