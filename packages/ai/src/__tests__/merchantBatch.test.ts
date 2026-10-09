import { describe, it, expect } from 'vitest'
import { validateMerchantBatch, getMerchantBatchPrompt } from '../merchantBatch'

describe('validateMerchantBatch', () => {
  const cats = ['Groceries', 'Coffee', 'Transport']

  it('one result per descriptor, matched by text even when reordered', () => {
    const out = validateMerchantBatch(
      {
        results: [
          { descriptor: 'UBER *TRIP', merchant: 'Uber', merchant_domain: 'https://www.uber.com/', category: 'transport' },
          { descriptor: 'WM SUPERCENTER #1489', merchant: 'Walmart', merchant_domain: 'walmart.com', category: 'Groceries' },
        ],
      },
      ['WM SUPERCENTER #1489', 'UBER *TRIP'],
      cats,
    )
    expect(out[0]).toEqual({ descriptor: 'WM SUPERCENTER #1489', merchant: 'Walmart', merchant_domain: 'walmart.com', category: 'Groceries' })
    expect(out[1]).toEqual({ descriptor: 'UBER *TRIP', merchant: 'Uber', merchant_domain: 'uber.com', category: 'Transport' })
  })

  it('a category not in the list, a junk domain or a missing answer come back null', () => {
    const out = validateMerchantBatch(
      { results: [{ descriptor: 'X', merchant: ' ', merchant_domain: 'null', category: 'Rent' }] },
      ['X', 'Y'],
      cats,
    )
    expect(out[0]).toEqual({ descriptor: 'X', merchant: null, merchant_domain: null, category: null })
    expect(out[1]).toEqual({ descriptor: 'Y', merchant: null, merchant_domain: null, category: null })
  })

  it('survives a malformed answer', () => {
    expect(validateMerchantBatch('nope', ['A'], cats)).toEqual([{ descriptor: 'A', merchant: null, merchant_domain: null, category: null }])
  })

  it('the prompt carries the shared merchant rules and the category list', () => {
    const p = getMerchantBatchPrompt(cats)
    expect(p).toContain('Mcgrath Volkswa')
    expect(p).toContain('"Coffee"')
  })
})
