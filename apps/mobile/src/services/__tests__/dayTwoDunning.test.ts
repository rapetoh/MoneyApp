/**
 * Regression test for the owner-reported bug: four "Anything to capture?"
 * Day-2 reminders landed within 21 minutes of each other. Root cause was a
 * non-atomic cancel-then-schedule sequence in `scheduleDayTwo` — see the
 * module doc comment on `serialized()` in `../dayTwoDunning.ts` for the
 * full mechanism. This file pins the fix at the unit level: N concurrent
 * calls into the module must never leave more than one notification
 * scheduled, and cancelling anywhere in the interleaving must still
 * settle on either zero or one, never orphaning an earlier "new" one.
 *
 * The mocked `expo-secure-store`/`expo-notifications` calls each await a
 * macrotask (`setTimeout`) before resolving, deliberately reproducing the
 * interleaving window the real race depended on — without that delay,
 * even the unserialized original implementation would happen to look
 * correct in a single-threaded test runner where nothing actually
 * interleaves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  scheduled: new Set<string>(),
  nextId: 0,
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
    return { granted: true, ios: {}, canAskAgain: true }
  },
  requestPermissionsAsync: async () => {
    await tick()
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
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

const { scheduleDayTwo, cancelDayTwo, rescheduleDayTwo } = await import('../dayTwoDunning')

describe('dayTwoDunning — concurrent scheduling cannot orphan a reminder', () => {
  beforeEach(() => {
    state.store.clear()
    state.scheduled.clear()
    state.nextId = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('N concurrent scheduleDayTwo calls leave exactly one scheduled notification', async () => {
    await Promise.all([
      scheduleDayTwo('en'),
      scheduleDayTwo('en'),
      scheduleDayTwo('en'),
      scheduleDayTwo('en'),
    ])

    expect(state.scheduled.size).toBe(1)
    // The one survivor must be the id actually persisted — not an orphan
    // a later caller's read-cancel-write raced past.
    const persisted = state.store.get('day_two_notification_id')
    expect(persisted).toBeDefined()
    expect(state.scheduled.has(persisted!)).toBe(true)
  })

  it('the same race reproduced through the real call site (rescheduleDayTwo, as fired once per transaction) also settles on one', async () => {
    await Promise.all([
      rescheduleDayTwo('en'),
      rescheduleDayTwo('en'),
      rescheduleDayTwo('en'),
    ])

    expect(state.scheduled.size).toBe(1)
  })

  it('a cancel interleaved with concurrent schedules never leaves an orphan', async () => {
    const calls = [scheduleDayTwo('en'), cancelDayTwo(), scheduleDayTwo('en')]
    await Promise.all(calls)

    // Either zero (if cancel's turn landed last) or one (if a schedule
    // landed last) — never more than one, which is the only thing an
    // orphan could produce.
    expect(state.scheduled.size).toBeLessThanOrEqual(1)
    const persisted = state.store.get('day_two_notification_id')
    if (persisted) {
      expect(state.scheduled.has(persisted)).toBe(true)
    } else {
      expect(state.scheduled.size).toBe(0)
    }
  })

  it('sequential calls behave exactly as before — cancels the prior notification, schedules one new one', async () => {
    await scheduleDayTwo('en')
    expect(state.scheduled.size).toBe(1)
    const first = state.store.get('day_two_notification_id')

    await scheduleDayTwo('en')
    expect(state.scheduled.size).toBe(1)
    const second = state.store.get('day_two_notification_id')

    expect(second).not.toBe(first)
    expect(state.scheduled.has(first!)).toBe(false)
  })
})
