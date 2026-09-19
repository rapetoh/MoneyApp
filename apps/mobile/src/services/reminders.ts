import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { getCalendars } from 'expo-localization'
import { t, localParts, localDay, addDays, civilDateTimeToInstant, type Locale } from '@voice-expense/shared'

/**
 * Reminders: the evening check-in and the quiet-day nudges (first-run
 * audit C4, M4 and M6, Sep 19 2026). Replaces the Day-2 dunning module.
 *
 * What was wrong with the old module: permission was only requested when
 * the transaction count jumped from 0 to 1 inside one session, so anyone
 * whose first transaction came from onboarding (the income step) was never
 * asked and never reminded; when it did ask, it asked cold, on top of the
 * first save; and it sent exactly one message, 24h after the last log,
 * saying "You usually log by now" to someone who had logged once.
 *
 * Now permission is asked on an explained screen (onboarding's habit step,
 * or the one-time prime sheet for accounts that finished onboarding before
 * this build), and two schedules exist:
 *   - Evening check-in (opt-in, user-chosen hour): one reminder a day for
 *     the next 7 days, skipping today once something was logged today. The
 *     copy shifts as the user goes quiet (day 3, day 7). Rescheduled on
 *     every log and every app foreground, so an active user always has the
 *     next week covered and an absent one stops hearing from us after 7 days.
 *   - Quiet nudges (default on, used only when the check-in is off): 1, 3
 *     and 7 days after the last log.
 *
 * Every read-cancel-schedule-write sequence runs through one serialized
 * queue (the fix for the Aug 2026 "four reminders in 21 minutes" bug, kept
 * as is): overlapping callers can never interleave and orphan a
 * notification that no later cancel can reach.
 */

const KEY_IDS = 'reminders_scheduled_ids'
const KEY_LAST_LOG = 'reminders_last_log_at'
const KEY_CHECKIN = 'reminders_checkin'
const KEY_PRIME_DISMISSED = 'reminders_prime_dismissed'
// Kept from the Day-2 module so existing installs carry their state over.
const KEY_ASKED = 'day_two_permission_asked'
const KEY_QUIET_OPTED_OUT = 'day_two_user_opted_out'
const KEY_LEGACY_ID = 'day_two_notification_id'

/** Every per-user key this module owns, for sign-out teardown (useAuth). */
export const REMINDER_SECURE_KEYS = [KEY_IDS, KEY_LAST_LOG, KEY_CHECKIN, KEY_PRIME_DISMISSED, KEY_ASKED, KEY_QUIET_OPTED_OUT]

export interface CheckIn {
  enabled: boolean
  hour: number
  minute: number
}

export const DEFAULT_CHECKIN: CheckIn = { enabled: true, hour: 20, minute: 0 }

/** Hours offered for the check-in (onboarding and Settings). */
export const CHECKIN_HOURS = [18, 19, 20, 21, 22] as const

export type ReminderKind = 'checkin' | 'quiet3' | 'quiet7'

export interface PlannedReminder {
  at: Date
  kind: ReminderKind
}

const DAY_MS = 86_400_000
const HORIZON_DAYS = 7

/** The phone's own zone: a check-in fires on the phone's clock. */
function deviceTimeZone(): string {
  try {
    return getCalendars()[0]?.timeZone ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

/** "8:00 PM" / "20:00" for a check-in hour, in the user's language. */
export function formatCheckInHour(hour: number, locale: Locale): string {
  const iso = `2026-01-01T${String(hour).padStart(2, '0')}:00:00Z`
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

/**
 * Pure schedule: which reminders should be pending right now, with every
 * civil-date step done in `tz` through the shared period utilities.
 */
export function planReminders(input: {
  now: Date
  checkIn: CheckIn | null
  quietNudges: boolean
  lastLogAt: Date | null
  tz: string
}): PlannedReminder[] {
  const { now, checkIn, quietNudges, lastLogAt, tz } = input
  const kindAt = (at: Date): ReminderKind => {
    if (!lastLogAt) return 'checkin'
    const idle = at.getTime() - lastLogAt.getTime()
    if (idle >= 6.5 * DAY_MS) return 'quiet7'
    if (idle >= 2.5 * DAY_MS) return 'quiet3'
    return 'checkin'
  }

  if (checkIn?.enabled) {
    const nowIso = now.toISOString()
    const loggedToday = lastLogAt != null && localDay(lastLogAt.toISOString(), tz) === localDay(nowIso, tz)
    const today = localParts(nowIso, tz)
    const out: PlannedReminder[] = []
    for (let d = 0; d < HORIZON_DAYS; d++) {
      const day = addDays(today.y, today.m, today.d, d)
      const at = new Date(civilDateTimeToInstant(day.y, day.m, day.d, checkIn.hour, checkIn.minute, 0, tz))
      if (at.getTime() <= now.getTime()) continue
      if (d === 0 && loggedToday) continue
      out.push({ at, kind: kindAt(at) })
    }
    return out
  }

  if (!quietNudges || !lastLogAt) return []
  const offsets: [number, ReminderKind][] = [
    [1, 'checkin'],
    [3, 'quiet3'],
    [7, 'quiet7'],
  ]
  return offsets
    .map(([days, kind]) => ({ at: new Date(lastLogAt.getTime() + days * DAY_MS), kind }))
    .filter((r) => r.at.getTime() > now.getTime())
}

// Foreground presentation: banner + list + the default sound, no badge.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

let chain: Promise<unknown> = Promise.resolve()

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  // The chain itself must never reject, or every later call would wedge.
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

// ── Permission ──────────────────────────────────────────────────────────

/** Current permission, without prompting. Provisional counts as granted. */
export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const settings = await Notifications.getPermissionsAsync()
  if (settings.granted) return 'granted'
  if (settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted'
  if (settings.canAskAgain === false) return 'denied'
  return 'undetermined'
}

/** Shows the system alert. Only call from a screen that has explained why. */
export async function requestPermission(): Promise<'granted' | 'denied'> {
  await SecureStore.setItemAsync(KEY_ASKED, '1')
  const settings = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true, provideAppNotificationSettings: true },
  })
  return settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ? 'granted'
    : 'denied'
}

// ── Preferences ─────────────────────────────────────────────────────────

export async function getCheckIn(): Promise<CheckIn | null> {
  const raw = await SecureStore.getItemAsync(KEY_CHECKIN)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as CheckIn
    return typeof v.hour === 'number' ? v : null
  } catch {
    return null
  }
}

export async function setCheckIn(value: CheckIn): Promise<void> {
  await SecureStore.setItemAsync(KEY_CHECKIN, JSON.stringify(value))
}

export async function isQuietNudgesOptedOut(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_QUIET_OPTED_OUT)) === '1'
}

export async function setQuietNudgesOptedOut(optedOut: boolean): Promise<void> {
  if (optedOut) await SecureStore.setItemAsync(KEY_QUIET_OPTED_OUT, '1')
  else await SecureStore.deleteItemAsync(KEY_QUIET_OPTED_OUT)
}

/**
 * The one-time prime sheet is for accounts that were never asked (they
 * finished onboarding before the habit step existed): permission still
 * undetermined, never asked, no check-in chosen, sheet not dismissed.
 */
export async function shouldOfferPrime(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const [asked, dismissed, checkIn, status] = await Promise.all([
    SecureStore.getItemAsync(KEY_ASKED),
    SecureStore.getItemAsync(KEY_PRIME_DISMISSED),
    getCheckIn(),
    getPermissionStatus(),
  ])
  return asked !== '1' && dismissed !== '1' && checkIn == null && status === 'undetermined'
}

export async function dismissPrime(): Promise<void> {
  await SecureStore.setItemAsync(KEY_PRIME_DISMISSED, '1')
}

// ── Scheduling ──────────────────────────────────────────────────────────

async function readLastLog(): Promise<Date | null> {
  const raw = await SecureStore.getItemAsync(KEY_LAST_LOG)
  const d = raw ? new Date(raw) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

async function cancelAllUnsafe(): Promise<void> {
  let ids: string[] = []
  const raw = await SecureStore.getItemAsync(KEY_IDS)
  if (raw) {
    try {
      ids = JSON.parse(raw) as string[]
    } catch {
      ids = []
    }
  }
  const legacy = await SecureStore.getItemAsync(KEY_LEGACY_ID)
  if (legacy) ids.push(legacy)
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id)
    } catch {
      // Already fired or cleared by the OS; the stored id is stale either way.
    }
  }
  await SecureStore.deleteItemAsync(KEY_IDS)
  if (legacy) await SecureStore.deleteItemAsync(KEY_LEGACY_ID)
}

async function rescheduleUnsafe(locale: Locale, lastLogAt: Date | null | undefined): Promise<void> {
  if (lastLogAt !== undefined) {
    if (lastLogAt) await SecureStore.setItemAsync(KEY_LAST_LOG, lastLogAt.toISOString())
    else await SecureStore.deleteItemAsync(KEY_LAST_LOG)
  }
  await cancelAllUnsafe()
  if (Platform.OS === 'web') return
  if ((await getPermissionStatus()) !== 'granted') return

  const plan = planReminders({
    now: new Date(),
    checkIn: await getCheckIn(),
    quietNudges: !(await isQuietNudgesOptedOut()),
    lastLogAt: lastLogAt === undefined ? await readLastLog() : lastLogAt,
    tz: deviceTimeZone(),
  })
  const ids: string[] = []
  for (const r of plan) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: t(`reminders.${r.kind}_title`, locale),
        body: t(`reminders.${r.kind}_body`, locale),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
    })
    ids.push(id)
  }
  await SecureStore.setItemAsync(KEY_IDS, JSON.stringify(ids))
}

/**
 * Replace every pending reminder with the current plan. `lastLogAt`
 * updates the stored "last logged" time; omit it (Settings changes) to
 * reuse the stored one. Safe to call concurrently from anywhere.
 */
export function rescheduleReminders(locale: Locale, lastLogAt?: Date | null): Promise<void> {
  return serialized(() => rescheduleUnsafe(locale, lastLogAt))
}

/** Cancel everything pending (sign-out, account deletion). */
export function cancelAllReminders(): Promise<void> {
  return serialized(cancelAllUnsafe)
}

/**
 * Turn the evening check-in on at `hour`, ask for permission if it was
 * never asked (the caller's screen is the explanation), and schedule.
 */
export async function enableCheckIn(locale: Locale, hour: number = DEFAULT_CHECKIN.hour): Promise<'granted' | 'denied'> {
  await setCheckIn({ enabled: true, hour, minute: 0 })
  let status = await getPermissionStatus()
  if (status === 'undetermined') status = await requestPermission()
  await rescheduleReminders(locale)
  return status === 'granted' ? 'granted' : 'denied'
}
