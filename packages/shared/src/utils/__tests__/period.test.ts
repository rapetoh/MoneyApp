import { describe, it, expect } from 'vitest'
import {
  WEEK_START,
  localParts,
  localDay,
  monthIso,
  monthBounds,
  weekStart,
  weekBounds,
  periodBounds,
  addMonthsClamped,
  weekdayLabels,
} from '../period'

describe('WEEK_START', () => {
  it('is ISO Monday — the tie-break between the seven Monday-first call sites and the three Sunday-first ones (04-F4)', () => {
    expect(WEEK_START).toBe(1)
  })
})

describe('localDay — a US-Central evening transaction lands on the right day (04-F4)', () => {
  it('resolves 2026-09-01T01:00:00Z to 31 August in America/Chicago, not 1 September', () => {
    expect(localDay('2026-09-01T01:00:00Z', 'America/Chicago')).toBe('2026-08-31')
  })

  it('the same instant resolves to a different UTC day, proving the zone — not the runtime — decides', () => {
    expect(localDay('2026-09-01T01:00:00Z', 'UTC')).toBe('2026-09-01')
  })

  it('a zone ahead of UTC can roll to the next day while Chicago and UTC have not yet', () => {
    const instant = '2026-08-31T20:00:00Z'
    expect(localDay(instant, 'America/Chicago')).toBe('2026-08-31')
    expect(localDay(instant, 'UTC')).toBe('2026-08-31')
    expect(localDay(instant, 'Asia/Tokyo')).toBe('2026-09-01')
  })
})

describe('localParts — Aug 2026 grid alignment (Aug 1 = Saturday)', () => {
  it('reports Aug 1 2026 as a Saturday: weekdayIndex 5 under Monday=0..Sunday=6', () => {
    const parts = localParts('2026-08-01T12:00:00Z', 'UTC')
    expect(parts).toMatchObject({ y: 2026, m: 8, d: 1, weekdayIndex: 5 })
  })

  it('reports Aug 15 2026 (three weeks later) as a Saturday too', () => {
    expect(localParts('2026-08-15T12:00:00Z', 'UTC').weekdayIndex).toBe(5)
  })

  it('never returns hour 24 for local midnight (some Intl hourCycle configurations render it that way)', () => {
    const parts = localParts('2026-08-01T00:00:00Z', 'UTC')
    expect(parts.hour).toBe(0)
  })
})

describe('monthBounds — the fix-plan "done when" fixture', () => {
  it('matches the literal expected bounds from fix-plan item 1.3', () => {
    expect(monthBounds('2026-08', 'America/Chicago')).toEqual({
      start: '2026-08-01T05:00:00.000Z',
      endExclusive: '2026-09-01T05:00:00.000Z',
    })
  })

  it('rolls December into January of the next year without a manual branch', () => {
    expect(monthBounds('2026-12', 'UTC')).toEqual({
      start: '2026-12-01T00:00:00.000Z',
      endExclusive: '2027-01-01T00:00:00.000Z',
    })
  })

  it('produces a UTC month\'s bounds exactly 1st-to-1st with no zone offset', () => {
    const b = monthBounds('2026-02', 'UTC')
    expect(b.start).toBe('2026-02-01T00:00:00.000Z')
    expect(b.endExclusive).toBe('2026-03-01T00:00:00.000Z')
  })
})

describe('DST transitions — America/Chicago spring-forward (2026-03-08) and fall-back (2026-11-01)', () => {
  it('resolves different UTC offsets for the start and end of a month that crosses spring-forward', () => {
    // March 2026 opens in CST (UTC-6, before the Mar 8 spring-forward)
    // and closes in CDT (UTC-5) — the month is 743 hours long, not 744.
    const b = monthBounds('2026-03', 'America/Chicago')
    expect(b.start).toBe('2026-03-01T06:00:00.000Z') // CST: -6
    expect(b.endExclusive).toBe('2026-04-01T05:00:00.000Z') // CDT: -5
    const hours = (Date.parse(b.endExclusive) - Date.parse(b.start)) / 3_600_000
    expect(hours).toBe(31 * 24 - 1)
  })

  it('resolves different UTC offsets for the start and end of a month that crosses fall-back', () => {
    // November 2026 opens in CDT (before the Nov 1 fall-back) and closes
    // in CST — 721 hours, not 720.
    const b = monthBounds('2026-11', 'America/Chicago')
    expect(b.start).toBe('2026-11-01T05:00:00.000Z') // CDT: -5
    expect(b.endExclusive).toBe('2026-12-01T06:00:00.000Z') // CST: -6
    const hours = (Date.parse(b.endExclusive) - Date.parse(b.start)) / 3_600_000
    expect(hours).toBe(30 * 24 + 1)
  })

  it('a week spanning the spring-forward transition is 167 hours, not 168 — day-count math stays exact across the DST boundary', () => {
    // Week of Mon 2026-03-02 .. Sun 2026-03-08 (spring-forward on the 8th).
    const b = weekBounds('2026-03-05T12:00:00Z', 'America/Chicago')
    expect(b.start).toBe('2026-03-02T06:00:00.000Z')
    expect(b.endExclusive).toBe('2026-03-09T05:00:00.000Z')
    const hours = (Date.parse(b.endExclusive) - Date.parse(b.start)) / 3_600_000
    expect(hours).toBe(7 * 24 - 1)
  })
})

describe('weekStart / weekBounds — Monday-first week', () => {
  it('resolves the Monday for a Saturday instant', () => {
    expect(weekStart('2026-08-15T12:00:00Z', 'America/Chicago')).toBe('2026-08-10')
  })

  it('returns half-open Monday 00:00 .. next Monday 00:00 bounds', () => {
    expect(weekBounds('2026-08-15T12:00:00Z', 'America/Chicago')).toEqual({
      start: '2026-08-10T05:00:00.000Z',
      endExclusive: '2026-08-17T05:00:00.000Z',
    })
  })
})

describe('periodBounds — one definition per BudgetPeriod, all five values', () => {
  const at = '2026-08-15T12:00:00Z' // Saturday, America/Chicago
  const tz = 'America/Chicago'

  it('weekly matches weekBounds and ignores any anchor', () => {
    expect(periodBounds('weekly', at, tz)).toEqual(weekBounds(at, tz))
  })

  it('monthly matches monthBounds(monthIso(...))', () => {
    expect(periodBounds('monthly', at, tz)).toEqual(monthBounds(monthIso(at, tz), tz))
  })

  it('quarterly resolves to the Jul-Sep calendar quarter', () => {
    expect(periodBounds('quarterly', at, tz)).toEqual({
      start: '2026-07-01T05:00:00.000Z',
      endExclusive: '2026-10-01T05:00:00.000Z',
    })
  })

  it('yearly resolves to the calendar year', () => {
    expect(periodBounds('yearly', at, tz)).toEqual({
      start: '2026-01-01T06:00:00.000Z',
      endExclusive: '2027-01-01T06:00:00.000Z',
    })
  })

  it('biweekly requires an anchor and throws a clear error without one', () => {
    expect(() => periodBounds('biweekly', at, tz)).toThrow(/anchor/i)
  })

  it('biweekly resolves the 14-day cycle containing `at`, phased off the anchor', () => {
    const anchor = '2026-08-03T05:00:00Z' // Monday 2026-08-03 00:00 local
    // 12 days after the anchor: still inside cycle 0 (days 0-13).
    expect(periodBounds('biweekly', at, tz, anchor)).toEqual({
      start: '2026-08-03T05:00:00.000Z',
      endExclusive: '2026-08-17T05:00:00.000Z',
    })
    // 17 days after the anchor: the *next* 14-day cycle.
    expect(periodBounds('biweekly', '2026-08-20T12:00:00Z', tz, anchor)).toEqual({
      start: '2026-08-17T05:00:00.000Z',
      endExclusive: '2026-08-31T05:00:00.000Z',
    })
  })

  it('every period produces start strictly before endExclusive', () => {
    const anchor = '2026-08-03T05:00:00Z'
    for (const period of ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const) {
      const b = periodBounds(period, at, tz, anchor)
      expect(Date.parse(b.start)).toBeLessThan(Date.parse(b.endExclusive))
    }
  })
})

describe('addMonthsClamped — month-end (Jan 31 + 1 month = Feb 28), never "Mar 3"', () => {
  it('Jan 31 + 1 month clamps to Feb 28 in a non-leap year', () => {
    expect(addMonthsClamped(2026, 1, 31, 1)).toEqual({ y: 2026, m: 2, d: 28 })
  })

  it('Jan 31 + 1 month clamps to Feb 29 in a leap year', () => {
    expect(addMonthsClamped(2024, 1, 31, 1)).toEqual({ y: 2024, m: 2, d: 29 })
  })

  it('Jan 31 + 2 months lands on Mar 31 unclamped (March has 31 days)', () => {
    expect(addMonthsClamped(2026, 1, 31, 2)).toEqual({ y: 2026, m: 3, d: 31 })
  })

  it('Mar 31 - 1 month clamps to Feb 28', () => {
    expect(addMonthsClamped(2026, 3, 31, -1)).toEqual({ y: 2026, m: 2, d: 28 })
  })

  it('rolls the year forward across December', () => {
    expect(addMonthsClamped(2026, 12, 15, 1)).toEqual({ y: 2027, m: 1, d: 15 })
  })

  it('rolls the year backward across January', () => {
    expect(addMonthsClamped(2026, 1, 15, -1)).toEqual({ y: 2025, m: 12, d: 15 })
  })
})

describe('weekdayLabels — Monday-first, locale-correct (deletes the hardcoded Sunday-first arrays)', () => {
  it('starts on Monday for English', () => {
    const labels = weekdayLabels('en', 'short')
    expect(labels).toHaveLength(7)
    expect(labels[0]).toMatch(/mon/i)
    expect(labels[6]).toMatch(/sun/i)
  })

  it('is locale-correct for French, not a hardcoded English/Sunday-first array', () => {
    const labels = weekdayLabels('fr', 'short')
    expect(labels[0].toLowerCase()).toContain('lun') // lundi
  })
})

describe('RSC / sync-boundary serialization rule — plain strings and numbers only, never Date', () => {
  it('every public function returns primitives, not Date instances', () => {
    const bounds = monthBounds('2026-08', 'UTC')
    expect(typeof bounds.start).toBe('string')
    expect(typeof bounds.endExclusive).toBe('string')
    expect(bounds).not.toBeInstanceOf(Date)
    expect(typeof localDay('2026-08-15T00:00:00Z', 'UTC')).toBe('string')
    expect(typeof monthIso('2026-08-15T00:00:00Z', 'UTC')).toBe('string')
    expect(typeof weekStart('2026-08-15T00:00:00Z', 'UTC')).toBe('string')
    const parts = localParts('2026-08-15T00:00:00Z', 'UTC')
    for (const value of Object.values(parts)) {
      expect(typeof value).toBe('number')
    }
  })

  it('rejects a Date object at the type level — enforced by `npm run typecheck`, not at runtime', () => {
    // @ts-expect-error — instants cross this module's boundary as ISO
    // strings only, never as `Date` instances (fix-plan 1.3 / audit 04-F4:
    // a `Date` prop serializes unpredictably across an RSC or sync
    // boundary). If this stops erroring, the signature regressed to
    // accepting `Date` again.
    localDay(new Date('2026-08-15T00:00:00Z'), 'UTC')
  })
})
