import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, __resetRateLimitsForTests } from '../rateLimit'

describe('checkRateLimit', () => {
  beforeEach(() => __resetRateLimitsForTests())

  it('allows requests up to the limit within the window', () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit('parse:user-1', 3, 60_000, 1000).allowed).toBe(true)
    }
  })

  it('rejects the request that exceeds the limit within the window', () => {
    checkRateLimit('parse:user-1', 2, 60_000, 1000)
    checkRateLimit('parse:user-1', 2, 60_000, 1000)
    const third = checkRateLimit('parse:user-1', 2, 60_000, 1000)
    expect(third.allowed).toBe(false)
    expect(third.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('resets the count once the window elapses', () => {
    checkRateLimit('parse:user-1', 1, 60_000, 1000)
    expect(checkRateLimit('parse:user-1', 1, 60_000, 1500).allowed).toBe(false)
    expect(checkRateLimit('parse:user-1', 1, 60_000, 61_001).allowed).toBe(true)
  })

  it('tracks separate buckets per key — one user or route cannot exhaust another\'s budget', () => {
    checkRateLimit('parse:user-1', 1, 60_000, 1000)
    expect(checkRateLimit('parse:user-1', 1, 60_000, 1000).allowed).toBe(false)
    expect(checkRateLimit('scan:user-1', 1, 60_000, 1000).allowed).toBe(true)
    expect(checkRateLimit('parse:user-2', 1, 60_000, 1000).allowed).toBe(true)
  })
})
