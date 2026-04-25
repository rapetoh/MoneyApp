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

/** True only after the user successfully saves a transaction at least once.
 *  Used to gate the permission ask so we don't burn the one-shot dialog
 *  before the user understands what they're agreeing to. */
export async function hasAskedPermissionBefore(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(STORAGE_PERMISSION_ASKED)
  return v === '1'
}

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

/** Schedule the dunning notification 24h from now. Cancels any
 *  previously-scheduled instance first. No-ops when permission isn't
 *  granted or the user has opted out. */
export async function scheduleDayTwo(locale: Locale): Promise<void> {
  if (await isUserOptedOut()) return

  const status = await getPermissionStatus()
  if (status !== 'granted') return

  // Cancel previous schedule if any. The id is persisted in SecureStore
  // because Notifications.getAllScheduledNotificationsAsync isn't reliable
  // to filter on its own (other plugins may schedule too).
  await cancelDayTwo()

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

/** Cancel any pending Day-2 dunning notification. Safe to call from any
 *  surface where new activity should reset the 24h clock (transaction
 *  save, transaction delete, app foreground). */
export async function cancelDayTwo(): Promise<void> {
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
