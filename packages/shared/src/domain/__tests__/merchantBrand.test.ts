/**
 * Card-network descriptor cleanup + brand→domain (Apple Pay capture logos,
 * Aug 24 2026 owner remark). The descriptor fixtures are the owner's real
 * Chase/Wallet strings.
 */
import { describe, expect, it } from 'vitest'
import { cleanMerchantDescriptor, brandDomainForMerchant, normalizeMerchantCase } from '../merchantBrand'

describe('cleanMerchantDescriptor', () => {
  it.each([
    ['Target T-1768', 'Target'],
    ['MAVERIK #05213 CEDAR R, Cedar Rapids, IA', 'MAVERIK CEDAR R'],
    ['STARBUCKS #12345', 'STARBUCKS'],
    ['Amazon.com*AB12', 'Amazon.com'],
    ['Three Square Market Vending, Cedar Rapids', 'Three Square Market Vending'],
    ['WALGREENS #0987', 'WALGREENS'],
    ['Peking Buffet Inc', 'Peking Buffet Inc'],
  ])('%s → %s', (raw, expected) => {
    expect(cleanMerchantDescriptor(raw)).toBe(expected)
  })
  it('never returns empty for a non-empty input', () => {
    expect(cleanMerchantDescriptor('#123')).toBe('#123')
    expect(cleanMerchantDescriptor('  ')).toBe('')
  })
})

describe('brandDomainForMerchant', () => {
  it.each([
    ['Target T-1768', 'target.com'],
    ['MAVERIK #05213 CEDAR R, Cedar Rapids, IA', 'maverik.com'],
    ['CHICK-FIL-A #01822', 'chick-fil-a.com'],
    ['STARBUCKS #12345', 'starbucks.com'],
    ['HY-VEE 1234', 'hy-vee.com'],
    ['KWIK STAR #1071', 'kwiktrip.com'],
    ['MURPHY USA #7602', 'murphyusa.com'],
    ['UBER *TRIP', 'uber.com'],
    ['UBER EATS', 'ubereats.com'],
    ['NETFLIX.COM', 'netflix.com'],
  ])('%s → %s', (raw, expected) => {
    expect(brandDomainForMerchant(raw)).toBe(expected)
  })
  it('null for unknown local merchants — letter tile stays', () => {
    expect(brandDomainForMerchant('Canteen Des Moines 2')).toBeNull()
    expect(brandDomainForMerchant('Peking Buffet Inc')).toBeNull()
    expect(brandDomainForMerchant('')).toBeNull()
  })
})

describe('normalizeMerchantCase', () => {
  it('gives a shouted or whispered name the casing a person would write', () => {
    // The owner's Today list, build 64: "target" from the microphone sat
    // above "Target" from Siri, reading as two different shops.
    expect(normalizeMerchantCase('target')).toBe('Target')
    expect(normalizeMerchantCase('dollar tree')).toBe('Dollar Tree')
    expect(normalizeMerchantCase('WALMART')).toBe('Walmart')
  })

  it('leaves a name that already made a choice', () => {
    expect(normalizeMerchantCase('iPhone repair')).toBe('iPhone repair')
    expect(normalizeMerchantCase('eBay')).toBe('eBay')
    expect(normalizeMerchantCase("McDonald's")).toBe("McDonald's")
  })

  it('keeps short all-caps names, which are acronyms', () => {
    expect(normalizeMerchantCase('KFC')).toBe('KFC')
    expect(normalizeMerchantCase('IKEA')).toBe('IKEA')
    expect(normalizeMerchantCase('BP')).toBe('BP')
  })

  it('handles nothing at all', () => {
    expect(normalizeMerchantCase('')).toBe('')
    expect(normalizeMerchantCase(null)).toBe('')
    expect(normalizeMerchantCase('  spacex  ')).toBe('Spacex')
  })
})

// Oct 5 2026: "711594-Mcgrath Volkswa" was saved as the merchant with a "7"
// letter tile. The cleaner is the instant fallback while the AI answers.
import { cleanMerchantDescriptor as clean, normalizeMerchantDomain, merchantLogoSrc } from '../merchantBrand'

describe('card descriptors the cleaner must handle', () => {
  it.each([
    ['711594-Mcgrath Volkswa', 'Mcgrath Volkswa'],
    ['SQ *BLUE BOTTLE COFFEE', 'BLUE BOTTLE COFFEE'],
    ['TST* JOES PIZZA 4421', 'JOES PIZZA'],
    ['AMZN Mktp US*2K4L19XQ2', 'AMZN Mktp US'],
    ['PAYPAL *SPOTIFY', 'SPOTIFY'],
    ['SP * GYMSHARK', 'GYMSHARK'],
    ['CASEYS #3341 MARION IA', 'CASEYS MARION IA'],
    ["MCDONALD'S F12345", "MCDONALD'S"],
    ['SHELL OIL 57444091309', 'SHELL OIL'],
    ['Target T-1768', 'Target'],
    ['Blue Bottle Coffee', 'Blue Bottle Coffee'],
  ])('%s -> %s', (raw, expected) => {
    expect(clean(raw)).toBe(expected)
  })

  it('never returns an empty string for a real input', () => {
    expect(clean('123456')).toBe('123456')
  })
})

describe('normalizeMerchantDomain', () => {
  it.each([
    ['vw.com', 'vw.com'],
    ['https://www.Chick-fil-A.com/menu', 'chick-fil-a.com'],
    ['null', null],
    ['None', null],
    ['', null],
    ['not a domain', null],
    ['localhost', null],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeMerchantDomain(raw)).toBe(expected)
  })
})

describe('merchantLogoSrc', () => {
  it('asks for the www. host, which resolves logos the bare host misses', () => {
    expect(merchantLogoSrc('chick-fil-a.com')).toContain('url=http://www.chick-fil-a.com')
    expect(merchantLogoSrc('www.vw.com')).toContain('url=http://www.vw.com')
  })
})
