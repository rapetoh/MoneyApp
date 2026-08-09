import { describe, it, expect } from 'vitest'
import {
  isSupportedLocale,
  isSupportedCurrency,
  isSupportedScanType,
  contentLengthExceeds,
  MAX_TRANSCRIPT_LENGTH,
} from '../parseGuards'

describe('isSupportedLocale', () => {
  it('accepts the four supported locales', () => {
    for (const l of ['en', 'fr', 'es', 'pt']) expect(isSupportedLocale(l)).toBe(true)
  })
  it('rejects an unsupported or malformed locale', () => {
    expect(isSupportedLocale('de')).toBe(false)
    expect(isSupportedLocale('EN')).toBe(false)
    expect(isSupportedLocale(undefined)).toBe(false)
    expect(isSupportedLocale(42)).toBe(false)
  })
})

describe('isSupportedCurrency', () => {
  it('accepts a real ISO 4217 code regardless of case', () => {
    expect(isSupportedCurrency('USD')).toBe(true)
    expect(isSupportedCurrency('eur')).toBe(true)
  })
  it('rejects a made-up or malformed currency', () => {
    expect(isSupportedCurrency('dollars')).toBe(false)
    expect(isSupportedCurrency('XYZ')).toBe(false)
    expect(isSupportedCurrency(null)).toBe(false)
  })
})

describe('isSupportedScanType', () => {
  it('accepts only receipt/paycheck', () => {
    expect(isSupportedScanType('receipt')).toBe(true)
    expect(isSupportedScanType('paycheck')).toBe(true)
    expect(isSupportedScanType('invoice')).toBe(false)
    expect(isSupportedScanType(undefined)).toBe(false)
  })
})

function fakeRequest(contentLength: string | null) {
  return { headers: { get: (name: string) => (name === 'content-length' ? contentLength : null) } }
}

describe('contentLengthExceeds', () => {
  it('returns false when the header is absent (chunked bodies still hit the per-field checks)', () => {
    expect(contentLengthExceeds(fakeRequest(null), 1000)).toBe(false)
  })
  it('returns false when under the limit', () => {
    expect(contentLengthExceeds(fakeRequest('500'), 1000)).toBe(false)
  })
  it('returns true when over the limit', () => {
    expect(contentLengthExceeds(fakeRequest('5000'), 1000)).toBe(true)
  })
})

describe('MAX_TRANSCRIPT_LENGTH', () => {
  it('is a sane positive bound', () => {
    expect(MAX_TRANSCRIPT_LENGTH).toBeGreaterThan(100)
  })
})
