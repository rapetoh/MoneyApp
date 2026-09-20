/**
 * Remote push registration.
 *
 * Murmur's notifications were local-only until Sep 19 2026: the app asked
 * iOS to show a fixed sentence at a fixed time, days ahead. That is why
 * every one of them was vague ("Anything to add from today?") - the phone
 * cannot know tomorrow's numbers today. Anything with a figure in it has
 * to be computed at send time, on the server, which means the server needs
 * somewhere to send. This file is that: it hands the device's Expo push
 * token to `public.push_tokens` and keeps the row honest.
 *
 * Deliberately NOT here: asking for permission. The permission prompt
 * belongs to a screen that has explained itself first (onboarding's habit
 * step, or the prime sheet), which is the rule `reminders.ts` already
 * follows and the one App Review expects. This module registers only when
 * permission is already granted, and goes quiet otherwise.
 *
 * One row per install, not per user. A phone handed to someone else and
 * signed into a different account must move its token to the new owner
 * rather than deliver their notifications to both, which is why the
 * upsert conflicts on `token` and overwrites `user_id`.
 */
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { getPermissionStatus } from './reminders'

/** Cached for the session so a re-render or a second foreground does not
 *  re-hit Expo's token endpoint. */
let cachedToken: string | null = null

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId
  )
}

/**
 * Android notification channels, one per family, created before the first
 * push arrives so the OS files each message under a name the user
 * recognises. This is what lets someone mute weekly recaps in system
 * settings without also muting a failed payment - a distinction Android
 * offers natively and iOS does not.
 *
 * Kept here rather than gated behind the Android build because creating a
 * channel is a no-op on iOS and this way the two platforms cannot drift.
 */
async function ensureChannels(labels: Record<string, string>): Promise<void> {
  if (Platform.OS !== 'android') return
  const families: [string, Notifications.AndroidImportance][] = [
    ['money', Notifications.AndroidImportance.HIGH],
    ['bill', Notifications.AndroidImportance.HIGH],
    ['budget', Notifications.AndroidImportance.DEFAULT],
    ['receipt', Notifications.AndroidImportance.DEFAULT],
    ['insight', Notifications.AndroidImportance.LOW],
    ['habit', Notifications.AndroidImportance.LOW],
  ]
  await Promise.all(
    families.map(([id, importance]) =>
      Notifications.setNotificationChannelAsync(id, {
        name: labels[id] ?? id,
        importance,
      }).catch(() => undefined),
    ),
  )
}

/**
 * Register this device for push, if it can be. Safe to call on every
 * launch and every foreground: it is idempotent and cheap after the first
 * success.
 *
 * Silent on every failure path. A device that cannot register still has
 * working local reminders, and there is nothing here worth interrupting
 * someone about.
 */
export async function registerPushToken(
  userId: string,
  opts: { locale?: string; appVersion?: string; channelLabels?: Record<string, string> } = {},
): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null
    // Never prompts. An account that declined notifications simply has no
    // row, and the sweep skips it for free.
    if ((await getPermissionStatus()) !== 'granted') return null

    await ensureChannels(opts.channelLabels ?? {})

    if (!cachedToken) {
      const pid = projectId()
      const res = await Notifications.getExpoPushTokenAsync(pid ? { projectId: pid } : undefined)
      cachedToken = res.data
    }
    if (!cachedToken) return null

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token: cachedToken,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        locale: opts.locale ?? null,
        app_version: opts.appVersion ?? null,
        last_seen_at: new Date().toISOString(),
        // A reinstall revives a row that a DeviceNotRegistered ticket
        // retired; clearing these is what brings it back into the sweep.
        disabled_at: null,
        disabled_reason: null,
      },
      { onConflict: 'token' },
    )
    if (error) {
      console.warn('[push] token upsert failed', error.message)
      return null
    }
    return cachedToken
  } catch (err) {
    // The expected failure is a simulator, which has no APNs registration
    // to hand out and throws from getExpoPushTokenAsync. Checking for a
    // physical device up front would mean adding a native module for one
    // boolean; the catch costs nothing and covers every other cause too
    // (no network at launch, Expo's endpoint down, a revoked key).
    console.warn('[push] registration skipped', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Retire this device's token at sign-out.
 *
 * Not a delete: the row is the only thing standing between the next person
 * to sign in on this phone and someone else's notifications, and the
 * upsert above rebinds it by `token`. Marking it disabled stops delivery
 * immediately while keeping that rebinding intact.
 */
export async function unregisterPushToken(): Promise<void> {
  if (!cachedToken) return
  try {
    await supabase
      .from('push_tokens')
      .update({ disabled_at: new Date().toISOString(), disabled_reason: 'signed_out' })
      .eq('token', cachedToken)
  } catch {
    /* signing out must never fail on this */
  } finally {
    cachedToken = null
  }
}

/**
 * Routes a tap on a server-sent notification to the screen that proves it.
 *
 * A notification that says "you passed your budget" and opens a generic
 * home tab makes the user do the work of finding the claim, which is the
 * fastest way to teach someone that these are not worth opening. Every
 * candidate in the engine carries a `screen` for exactly this.
 *
 * Wallet-capture notifications are handled by
 * `subscribeWalletCaptureResponses` and carry their own `kind`; this
 * listener ignores anything without a `screen`, so the two coexist.
 */
export function subscribePushNavigation(navigate: (path: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { screen?: string; budget?: string; rule?: string } | undefined
    const screen = data?.screen
    if (!screen) return
    switch (screen) {
      case 'paywall':
        navigate('/more/paywall')
        break
      case 'recurring':
        navigate('/recurring')
        break
      case 'budgets':
        navigate('/(tabs)/budgets')
        break
      case 'insights':
        navigate('/(tabs)/insights')
        break
      case 'ask':
        navigate('/more/ask')
        break
      case 'record':
        navigate('/(tabs)/record')
        break
      default:
        // An unknown screen means an older build met a newer server.
        // Opening the app at all is the right fallback; guessing is not.
        break
    }
  })
  return () => sub.remove()
}
