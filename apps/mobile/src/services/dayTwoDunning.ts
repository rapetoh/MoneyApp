import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { t, type Locale } from '@voice-expense/shared'

/**
 * Day-2 dunning local notification (Phase H, DESIGN.md §"Retention").
 *
 * "You usually log by now. Anything to capture?" — fired roughly 24h after
 * the user's last logged transaction, but **only** if they've used the app
 * before (not on day-1, that's the Day-1 coach's job). Implemented with
 * `expo-notifications` so it works fully offline; no remote push setup is
 * required.
 *
 * Lifecycle:
 *   - First useful moment to ask for permission is right after the user
 *     successfully saves their first transaction. Asking earlier (e.g.
 *     during onboarding) burns the one-shot iOS dialog before the user
 *     understands the value.
 *   - On every transaction save, we cancel the previously-scheduled
 *     notification (if any) and schedule a new one 24h out. Repeat
 *     activity within 24h slides the notification forward indefinitely.
 *   - We persist the scheduled identifier in SecureStore so reschedules
 *     work across cold starts.
 *   - User can disable Day-2 nudges in Settings (handled at the
 *     Settings-call site; this module exposes `cancel()`).
 */

const STORAGE_NOTIF_ID = 'day_two_notification_id'
const STORAGE_PERMISSION_ASKED = 'day_two_permission_asked'
const STORAGE_USER_OPTED_OUT = 'day_two_user_opted_out'

const TWENTY_FOUR_HOURS_SEC = 24 * 60 * 60

/**
 * Serializes every read-cancel-schedule-write sequence below onto one
 * chain, so two overlapping callers can never interleave.
 *
 * This is the fix for the owner-reported bug: four "Anything to capture?"
 * notifications landed within 21 minutes. `scheduleDayTwo` already
 * cancelled the previous notification before scheduling a new one, but
 * that cancel-then-schedule sequence was not atomic — `useDayTwoDunning`
 * fires once per transaction-count change, and a batch of transactions
 * arriving close together (a sync merge, several quick captures) fired
 * several overlapping `rescheduleDayTwo` calls. Two calls that both read
 * `STORAGE_NOTIF_ID` before either had written it back both cancelled the
 * *same* previously-scheduled id and then each scheduled a brand-new one;
 * only the last writer's id survives in SecureStore, so every earlier
 * "new" notification becomes an orphan — never reachable by a future
 * cancel, since the stored id has moved on — that still fires ~24h later.
 * Repeat that race a few times during one burst of activity and the
 * orphans land within minutes of each other the next day.
 *
 * Routing `scheduleDayTwo` and `cancelDayTwo` through this queue makes the
 * whole sequence — read stored id, cancel it, schedule the replacement,
 * persist its id — run to completion before the next caller's sequence
 * starts, so at most one notification is ever pending. Internal callers
 * (`scheduleDayTwo` cancelling the previous instance as part of its own
 * turn) use the `*Unsafe` helpers directly to avoid deadlocking on their
 * own place in the queue.
 */
let chain: Promise<unknown> = Promise.resolve()

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  // The chain itself must never reject — a failed turn (e.g. a transient
  // Notifications API error) would otherwise wedge every subsequent call
  // behind a permanently-rejected promise.
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

// Configure how notifications are presented while the app is foregrounded.
// Day-2 dunning is meant to feel ambient, not aggressive — show the banner
// + play the default sound, no badge increment (we don't use unread counts).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

async function markPermissionAsked() {
  await SecureStore.setItemAsync(STORAGE_PERMISSION_ASKED, '1')
}

export async function isUserOptedOut(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(STORAGE_USER_OPTED_OUT)
  return v === '1'
}

export async function setUserOptedOut(optedOut: boolean) {
  if (optedOut) {
    await SecureStore.setItemAsync(STORAGE_USER_OPTED_OUT, '1')
    await cancelDayTwo()
  } else {
    await SecureStore.deleteItemAsync(STORAGE_USER_OPTED_OUT)
  }
}

/** Returns whether we currently hold notification permission. Does NOT
 *  prompt — pair with `requestDayTwoPermission` for the prompt flow. */
export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const settings = await Notifications.getPermissionsAsync()
  if (settings.granted) return 'granted'
  if (
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    // Provisional notifications deliver quietly to Notification Center —
    // good enough for a gentle "anything to capture?" nudge.
    return 'granted'
  }
  if (settings.canAskAgain === false) return 'denied'
  return 'undetermined'
}

/** Prompt the user for notification permission. Idempotent — repeated calls
 *  after a permanent deny do nothing on iOS (the OS suppresses re-asks). */
export async function requestDayTwoPermission(): Promise<'granted' | 'denied'> {
  await markPermissionAsked()
  const settings = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
      provideAppNotificationSettings: true,
    },
  })
  return settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ? 'granted'
    : 'denied'
}

/** Cancel any pending Day-2 dunning notification — the actual work, not
 *  queued. Only called directly by `scheduleDayTwoUnsafe` (as part of its
 *  own turn on the queue) and by the public `cancelDayTwo` below (which
 *  queues it). Do not call this directly from a new surface — call
 *  `cancelDayTwo` instead, or two unserialized callers reintroduce the
 *  exact race this module exists to close. */
async function cancelDayTwoUnsafe(): Promise<void> {
  const id = await SecureStore.getItemAsync(STORAGE_NOTIF_ID)
  if (!id) return
  try {
    await Notifications.cancelScheduledNotificationAsync(id)
  } catch {
    // Notification might already have fired or been cleared by the OS;
    // either way the persisted id is stale. Drop it.
  }
  await SecureStore.deleteItemAsync(STORAGE_NOTIF_ID)
}

/** Schedule the dunning notification 24h from now — the actual work, not
 *  queued. See `cancelDayTwoUnsafe`'s note: call `scheduleDayTwo` instead. */
async function scheduleDayTwoUnsafe(locale: Locale): Promise<void> {
  if (await isUserOptedOut()) return

  const status = await getPermissionStatus()
  if (status !== 'granted') return

  // Cancel previous schedule if any. The id is persisted in SecureStore
  // because Notifications.getAllScheduledNotificationsAsync isn't reliable
  // to filter on its own (other plugins may schedule too). Uses the
  // unqueued helper directly — this call is itself already running inside
  // one turn of the queue (see `scheduleDayTwo` below); routing it back
  // through the public, queued `cancelDayTwo` would await a turn that
  // can't start until this one finishes, i.e. deadlock.
  await cancelDayTwoUnsafe()

  // Day-2 dunning is intentionally *not* a calendar trigger — we don't want
  // it pinned to a specific time of day. 24h sleep keeps the nudge tied to
  // the user's last interaction. iOS rejects 0-second triggers; the
  // `seconds` field implicitly seeds a TimeInterval trigger.
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: t('dunning.day2_title', locale),
      body: t('dunning.day2_body', locale),
      // No sound override — the app uses the system default tone, which is
      // calmer than a custom chime for a finance nudge.
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: TWENTY_FOUR_HOURS_SEC,
      repeats: false,
    },
  })

  await SecureStore.setItemAsync(STORAGE_NOTIF_ID, id)
}

/** Schedule the dunning notification 24h from now. Cancels any
 *  previously-scheduled instance first, and is safe to call concurrently
 *  from multiple call sites — every call is serialized onto one queue
 *  (see the module doc comment above), so overlapping callers can never
 *  interleave a cancel with someone else's schedule and orphan a
 *  notification. No-ops when permission isn't granted or the user has
 *  opted out. */
export function scheduleDayTwo(locale: Locale): Promise<void> {
  return serialized(() => scheduleDayTwoUnsafe(locale))
}

/** Cancel any pending Day-2 dunning notification. Safe to call from any
 *  surface where new activity should reset the 24h clock (transaction
 *  save, transaction delete, app foreground) — queued the same as
 *  `scheduleDayTwo`, so a cancel and a concurrent schedule can't race. */
export function cancelDayTwo(): Promise<void> {
  return serialized(cancelDayTwoUnsafe)
}

/** Permission-then-schedule helper. Call after the user's first
 *  transaction save (the natural moment they understand the value of
 *  reminders). Returns the resulting permission status so callers can
 *  surface a "go to Settings" hint on denial if they want to. */
export async function ensureDayTwoPermissionAndSchedule(
  locale: Locale,
): Promise<'granted' | 'denied'> {
  if (await isUserOptedOut()) return 'denied'

  let status = await getPermissionStatus()
  if (status === 'undetermined') {
    status = await requestDayTwoPermission()
  }
  if (status === 'granted') {
    await scheduleDayTwo(locale)
    return 'granted'
  }
  return 'denied'
}

/** Resume helper for the regular case: user already granted permission and
 *  is logging an Nth transaction. Just reschedules. Never prompts. */
export async function rescheduleDayTwo(locale: Locale): Promise<void> {
  if (Platform.OS === 'web') return // expo-notifications no-ops on web
  if (await isUserOptedOut()) return
  const status = await getPermissionStatus()
  if (status !== 'granted') return
  await scheduleDayTwo(locale)
}
