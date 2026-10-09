import { describe, it, expect } from 'vitest'
import { goalStatus } from '../goals'

const tz = 'UTC'
const goal = { target_amount: 1200, target_date: '2027-01-01', created_at: '2026-01-01T12:00:00Z' }

describe('goalStatus', () => {
  it('sums contributions, withdrawals included, never below zero', () => {
    expect(goalStatus(goal, [{ amount: 500 }, { amount: -100 }], tz, '2026-07-02T12:00:00Z').saved).toBe(400)
    expect(goalStatus(goal, [{ amount: -50 }], tz, '2026-07-02T12:00:00Z').saved).toBe(0)
  })

  it('reads on track while keeping up with the straight line to the date', () => {
    // 182 of 365 days gone: about 598 expected.
    expect(goalStatus(goal, [{ amount: 600 }], tz, '2026-07-02T12:00:00Z').pace).toBe('on_track')
    expect(goalStatus(goal, [{ amount: 900 }], tz, '2026-07-02T12:00:00Z').pace).toBe('ahead')
    expect(goalStatus(goal, [{ amount: 200 }], tz, '2026-07-02T12:00:00Z').pace).toBe('behind')
  })

  it('says what to put aside each month to finish on time', () => {
    const s = goalStatus(goal, [{ amount: 600 }], tz, '2026-07-02T12:00:00Z')
    expect(s.daysLeft).toBe(183)
    expect(s.perMonth).toBeCloseTo(600 / (183 / 30.4375), 1)
  })

  it('a reached goal is done, whatever the date', () => {
    const s = goalStatus(goal, [{ amount: 1300 }], tz, '2027-03-01T12:00:00Z')
    expect(s.pace).toBe('done')
    expect(s.pct).toBe(1)
    expect(s.remaining).toBe(0)
    expect(s.perMonth).toBeNull()
  })

  it('a past date with money still missing is overdue', () => {
    const s = goalStatus(goal, [{ amount: 100 }], tz, '2027-02-01T12:00:00Z')
    expect(s.pace).toBe('overdue')
    expect(s.perMonth).toBeNull()
  })

  it('no date: progress only', () => {
    const s = goalStatus({ ...goal, target_date: null }, [{ amount: 300 }], tz, '2026-07-02T12:00:00Z')
    expect(s.pace).toBe('no_date')
    expect(s.pct).toBe(0.25)
    expect(s.daysLeft).toBeNull()
  })

  it('the last month asks for everything left, not more', () => {
    const s = goalStatus(goal, [{ amount: 1000 }], tz, '2026-12-20T12:00:00Z')
    expect(s.perMonth).toBe(200)
  })
})
