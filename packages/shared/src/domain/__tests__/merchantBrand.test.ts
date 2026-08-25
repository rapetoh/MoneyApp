/**
 * Card-network descriptor cleanup + brand→domain (Apple Pay capture logos,
 * Aug 24 2026 owner remark). The descriptor fixtures are the owner's real
 * Chase/Wallet strings.
 */
import { describe, expect, it } from 'vitest'
import { cleanMerchantDescriptor, brandDomainForMerchant } from '../merchantBrand'

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
