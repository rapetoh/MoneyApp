/**
 * Reminders (first-run audit C4/M6). Two things are pinned here:
 *   1. The plan: evening check-ins cover the next 7 days, skip today once
 *      something was logged today, and the copy shifts as the user goes
 *      quiet; with the check-in off, quiet nudges land 1, 3 and 7 days
 *      after the last log.
 *   2. The no-orphan guarantee carried over from the Day-2 module (the
 *      Aug 2026 "four reminders in 21 minutes" bug): concurrent reschedules
 *      and cancels must leave exactly the planned set pending, every id of
 *      which is persisted so the next cancel can reach it.
 *
 * The mocked SecureStore / Notifications calls each await a macrotask so
 * the interleaving window the original race needed actually exists here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  scheduled: new Set<string>(),
  nextId: 0,
  permission: 'granted' as 'granted' | 'undetermined',
}))

function tick(ms = 1) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => {
    await tick()
    return state.store.get(key) ?? null
  },
  setItemAsync: async (key: string, value: string) => {
    await tick()
    state.store.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    await tick()
    state.store.delete(key)
  },
}))

vi.mock('expo-notifications', () => ({
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => {
    await tick()
    return { granted: state.permission === 'granted', ios: {}, canAskAgain: true }
  },
  requestPermissionsAsync: async () => {
    await tick()
    state.permission = 'granted'
    return { granted: true, ios: {} }
  },
  scheduleNotificationAsync: async () => {
    await tick()
    const id = `notif-${state.nextId++}`
    state.scheduled.add(id)
    return id
  },
  cancelScheduledNotificationAsync: async (id: string) => {
    await tick()
    state.scheduled.delete(id)
  },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-localization', () => ({ getCalendars: () => [{ timeZone: 'UTC' }] }))

const reminders = await import('../reminders')
const { planReminders, rescheduleReminders, cancelAllReminders, enableCheckIn, shouldOfferPrime } = reminders

function persistedIds(): string[] {
  const raw = state.store.get('reminders_scheduled_ids')
  return raw ? (JSON.parse(raw) as string[]) : []
}

beforeEach(() => {
  state.store.clear()
  state.scheduled.clear()
  state.nextId = 0
  state.permission = 'granted'
})

describe('planReminders', () => {
  const tz = 'America/New_York'
  // 12:00 in New York on Sep 19, 2026 (EDT, UTC-4).
  const now = new Date('2026-09-19T16:00:00Z')
  const checkIn = { enabled: true, hour: 20, minute: 0 }
  const at8pmNY = (day: number) => new Date(`2026-09-${String(day).padStart(2, '0')}T20:00:00-04:00`)

  it('check-in: seven evenings in the phone zone, starting tonight when nothing was logged today', () => {
    const plan = planReminders({ now, checkIn, quietNudges: true, lastLogAt: new Date('2026-09-18T13:00:00Z'), tz })
    expect(plan).toHaveLength(7)
    expect(plan[0].at).toEqual(at8pmNY(19))
    expect(plan[6].at).toEqual(at8pmNY(25))
  })

  it('check-in: skips tonight once something was logged today', () => {
    const plan = planReminders({ now, checkIn, quietNudges: true, lastLogAt: new Date('2026-09-19T12:00:00Z'), tz })
    expect(plan).toHaveLength(6)
    expect(plan[0].at).toEqual(at8pmNY(20))
  })

  it('check-in: copy shifts on day 3 and day 7 of silence', () => {
    const plan = planReminders({ now, checkIn, quietNudges: true, lastLogAt: new Date('2026-09-19T12:00:00Z'), tz })
    const kinds = plan.map((r) => r.kind)
    expect(kinds[0]).toBe('checkin')
    expect(kinds).toContain('quiet3')
    expect(kinds[kinds.length - 1]).toBe('quiet7')
  })

  it('no check-in: quiet nudges 1, 3 and 7 days after the last log', () => {
    const last = new Date('2026-09-19T13:00:00Z')
    const plan = planReminders({ now, checkIn: null, quietNudges: true, lastLogAt: last, tz })
    expect(plan.map((r) => r.kind)).toEqual(['checkin', 'quiet3', 'quiet7'])
    expect(plan[0].at.getTime() - last.getTime()).toBe(86_400_000)
  })

  it('nothing when nudges are off and there is no check-in, or nothing was ever logged', () => {
    expect(planReminders({ now, checkIn: null, quietNudges: false, lastLogAt: now, tz })).toEqual([])
    expect(planReminders({ now, checkIn: null, quietNudges: true, lastLogAt: null, tz })).toEqual([])
  })
})

describe('scheduling never orphans a reminder', () => {
  it('concurrent reschedules leave exactly one plan pending, all ids persisted', async () => {
    const last = new Date(Date.now() - 3_600_000)
    await Promise.all([
      rescheduleReminders('en', last),
      rescheduleReminders('en', last),
      rescheduleReminders('en', last),
      rescheduleReminders('en', last),
    ])
    const ids = persistedIds()
    expect(ids.length).toBe(3) // quiet nudges: +1d, +3d, +7d
    expect(state.scheduled.size).toBe(3)
    for (const id of ids) expect(state.scheduled.has(id)).toBe(true)
  })

  it('a cancel interleaved with reschedules settles on zero or one full plan', async () => {
    const last = new Date(Date.now() - 3_600_000)
    await Promise.all([rescheduleReminders('en', last), cancelAllReminders(), rescheduleReminders('en', last)])
    const ids = persistedIds()
    expect(state.scheduled.size).toBe(ids.length)
    for (const id of ids) expect(state.scheduled.has(id)).toBe(true)
  })

  it('cancels the legacy Day-2 notification left by the old module', async () => {
    state.scheduled.add('legacy')
    state.store.set('day_two_notification_id', 'legacy')
    await rescheduleReminders('en', null)
    expect(state.scheduled.has('legacy')).toBe(false)
    expect(state.store.has('day_two_notification_id')).toBe(false)
  })

  it('schedules nothing without permission', async () => {
    state.permission = 'undetermined'
    await rescheduleReminders('en', new Date())
    expect(state.scheduled.size).toBe(0)
  })
})

describe('enableCheckIn and the prime sheet', () => {
  it('asks once, then schedules the evening check-ins', async () => {
    state.permission = 'undetermined'
    expect(await shouldOfferPrime()).toBe(true)
    const result = await enableCheckIn('en', 21)
    expect(result).toBe('granted')
    expect(state.scheduled.size).toBeGreaterThanOrEqual(6)
    expect(await shouldOfferPrime()).toBe(false)
  })
})
