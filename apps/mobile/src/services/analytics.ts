import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'

/**
 * Opt-in, first-party product events and crash reports (first-run audit
 * H1, Sep 19 2026).
 *
 * The privacy policy promises that usage analytics, if ever added, are
 * opt-in. So nothing here leaves the phone unless the signed-in profile has
 * `analytics_opt_in` (events) or `crash_reports_opt_in` (crashes) set; the
 * server enforces the same rule in RLS (migration 033), so a client bug
 * cannot send without consent. Events go to our own `app_events` table,
 * keyed by a random per-install id: no user id, no amounts, no merchant
 * names, no transcripts. Every failure is swallowed; measurement must
 * never break the product.
 */

export type AnalyticsEvent =
  | 'onboarding_setup_done'
  | 'onboarding_goal'
  | 'onboarding_plus_shown'
  | 'mic_permission'
  | 'first_log_saved'
  | 'first_log_skipped'
  | 'habit_done'
  | 'paywall_viewed'
  | 'purchase_done'
  | 'getting_started_tap'
  | 'js_error'

type Props = Record<string, string | number | boolean | null>

const KEY_INSTALL = 'analytics_install_id'
const KEY_PENDING_CRASH = 'analytics_pending_crash'

let consent = { usage: false, crashes: false }
let installIdPromise: Promise<string> | null = null

/** Called by useProfile whenever the profile is (re)read. */
export function setAnalyticsConsent(next: { usage: boolean; crashes: boolean }): void {
  const becameCrashConsenting = next.crashes && !consent.crashes
  consent = next
  if (becameCrashConsenting) void flushPendingCrash()
}

function installId(): Promise<string> {
  if (!installIdPromise) {
    installIdPromise = (async () => {
      const existing = await SecureStore.getItemAsync(KEY_INSTALL)
      if (existing) return existing
      const id = Crypto.randomUUID()
      await SecureStore.setItemAsync(KEY_INSTALL, id)
      return id
    })().catch(() => Crypto.randomUUID())
  }
  return installIdPromise
}

async function send(event: AnalyticsEvent, props: Props): Promise<void> {
  try {
    await supabase.from('app_events').insert({
      install_id: await installId(),
      event,
      props,
      app_version: Constants.expoConfig?.version ?? null,
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    })
  } catch {
    // Offline, table not deployed yet, consent revoked mid-flight: drop it.
  }
}

/** Record a product event if, and only if, the user opted in. */
export function track(event: AnalyticsEvent, props: Props = {}): void {
  if (!consent.usage || event === 'js_error') return
  void send(event, props)
}

async function flushPendingCrash(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_PENDING_CRASH)
    if (!raw) return
    await SecureStore.deleteItemAsync(KEY_PENDING_CRASH)
    await send('js_error', JSON.parse(raw) as Props)
  } catch {
    // ignore
  }
}

type ErrorUtilsShape = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void
  setGlobalHandler: (fn: (error: unknown, isFatal?: boolean) => void) => void
}

let crashHandlerInstalled = false

/**
 * Wrap React Native's global JS error handler. A fatal error kills the JS
 * runtime before a network call can finish, so the report is also written
 * to SecureStore and sent on the next launch once consent is known.
 * Native crashes are not covered here; Apple collects those for users who
 * share analytics with developers (App Store Connect > Crashes).
 */
export function installCrashReporting(): void {
  if (crashHandlerInstalled) return
  const eu = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils
  if (!eu) return
  crashHandlerInstalled = true
  const previous = eu.getGlobalHandler()
  eu.setGlobalHandler((error, isFatal) => {
    try {
      const e = error as { message?: unknown; stack?: unknown; name?: unknown }
      const props: Props = {
        name: String(e?.name ?? 'Error').slice(0, 60),
        message: String(e?.message ?? error).slice(0, 300),
        stack: String(e?.stack ?? '').slice(0, 1500),
        fatal: !!isFatal,
      }
      if (isFatal) void SecureStore.setItemAsync(KEY_PENDING_CRASH, JSON.stringify(props))
      else if (consent.crashes) void send('js_error', props)
    } catch {
      // never let reporting throw from inside the error handler
    }
    previous(error, isFatal)
  })
}
