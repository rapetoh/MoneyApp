import { describe, it, expect } from 'vitest'
import { resolveNowUtc, resolveTimeZone } from './timeZone'

describe('resolveTimeZone', () => {
  it('passes through a valid IANA zone unchanged', () => {
    expect(resolveTimeZone('America/Chicago')).toBe('America/Chicago')
    expect(resolveTimeZone('Europe/Paris')).toBe('Europe/Paris')
    expect(resolveTimeZone('UTC')).toBe('UTC')
  })
  it('falls back to UTC on a missing/empty value', () => {
    expect(resolveTimeZone(undefined)).toBe('UTC')
    expect(resolveTimeZone(null)).toBe('UTC')
    expect(resolveTimeZone('')).toBe('UTC')
    expect(resolveTimeZone('   ')).toBe('UTC')
  })
  it('falls back to UTC on a malformed zone (typo, non-string)', () => {
    expect(resolveTimeZone('Not/AZone')).toBe('UTC')
    expect(resolveTimeZone(123)).toBe('UTC')
    expect(resolveTimeZone({})).toBe('UTC')
  })
})

describe('resolveNowUtc', () => {
  it('passes through a valid ISO instant unchanged', () => {
    expect(resolveNowUtc('2026-09-01T01:00:00Z')).toBe('2026-09-01T01:00:00Z')
  })
  it('falls back to the current instant on a missing/unparseable value', () => {
    const before = Date.now()
    const resolved = resolveNowUtc(undefined)
    const after = Date.now()
    const resolvedMs = Date.parse(resolved)
    expect(resolvedMs).toBeGreaterThanOrEqual(before)
    expect(resolvedMs).toBeLessThanOrEqual(after)
  })
  it('falls back on a garbage string', () => {
    expect(Number.isNaN(Date.parse(resolveNowUtc('not-a-date')))).toBe(false)
  })
})

describe('worked example (fix-plan 2.10 done-when): now_utc=2026-09-01T01:00:00Z, America/Chicago', () => {
  it('both fields survive validation unchanged so downstream window math can resolve "today" to Aug 31', () => {
    const now_utc = resolveNowUtc('2026-09-01T01:00:00Z')
    const time_zone = resolveTimeZone('America/Chicago')
    expect(now_utc).toBe('2026-09-01T01:00:00Z')
    expect(time_zone).toBe('America/Chicago')
    // The actual window-math assertion (that this resolves to Aug 31, not
    // Sep 1) lives in packages/ai/src/__tests__/askMurmur.test.ts's
    // `buildWindows` suite, against the exact function `ToolContext.tz`
    // feeds — this test only proves the route-level boundary passes the
    // worked example's inputs through without mangling them.
  })
})
