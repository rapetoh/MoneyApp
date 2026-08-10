/**
 * The `devices` table, finally written — fix-plan 3.7 ("A sync surface
 * that reports reality"). The table has existed since migration 001
 * (`id`, `user_id`, `platform`, `device_name`, `last_seen_at`,
 * `last_synced_at`) with an owner-scoped RLS policy, and nothing has
 * ever written a row to it. That is what let the web sidebar and web
 * Settings hardcode "Synced just now" — there was no real row anywhere
 * to read instead.
 *
 * This module owns exactly two writes:
 *   - `registerDevice`: upserted once per signed-in session, from
 *     `app/_layout.tsx`'s launch-scoped effect (the same
 *     `runOncePerSession` pattern `seedDefaultCategories`/
 *     `runRecurringCatchUp`/`runFxBackfill` already use) — "register on
 *     sign-in".
 *   - `touchDeviceSynced`: called by `SyncManager` at the end of a
 *     drain pass that actually ran online, so `last_synced_at` reflects
 *     the last time this device confirmed contact with the server —
 *     "last_synced_at on drain".
 *
 * The device id is a UUID generated once and persisted in SecureStore
 * (mirrors `useApiUrl.ts`'s per-device override key) rather than derived
 * from any hardware identifier — durable across app restarts, distinct
 * per install, and never sent anywhere but this table.
 */
import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { supabase } from '../../lib/supabase'

const DEVICE_ID_KEY = 'murmur_device_id_v1'

/** Cached in memory for the process lifetime once resolved — every
 *  caller in a session (registration, every drain's `touchDeviceSynced`)
 *  needs the same id, and there is no reason to hit SecureStore twice. */
let cachedDeviceId: string | null = null

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY)
  if (existing) {
    cachedDeviceId = existing
    return existing
  }
  const id = Crypto.randomUUID()
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id)
  cachedDeviceId = id
  return id
}

/** One of the four values `devices.platform`'s CHECK constraint allows
 *  that an Expo mobile runtime can actually report — 'desktop_mac'/
 *  'desktop_win' are the Electron shell's own values (out of this
 *  module's file ownership; see apps/desktop). */
function devicePlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios'
  if (Platform.OS === 'android') return 'android'
  return 'web'
}

function deviceDisplayName(): string {
  return Constants.deviceName || (Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android device' : 'Device')
}

/**
 * Registers (or refreshes) this device's row. Called once per signed-in
 * session — `last_seen_at` is what tells a user "this account is signed
 * in on 2 devices" versus 1, so it is worth refreshing on every launch,
 * not just the first one. Best-effort: a failure here must not block
 * app launch, matching every other launch-scoped service in
 * `_layout.tsx` (`runOncePerSession` already swallows and logs).
 */
export async function registerDevice(userId: string): Promise<void> {
  const id = await getDeviceId()
  const { error } = await supabase.from('devices').upsert({
    id,
    user_id: userId,
    platform: devicePlatform(),
    device_name: deviceDisplayName(),
    last_seen_at: new Date().toISOString(),
  })
  if (error) {
    console.warn('[deviceRegistry] registerDevice failed:', error.message)
  }
}

/**
 * Stamps `last_synced_at = now()` for this device. Called by
 * `SyncManager` at the end of a drain pass that ran online — this is
 * the value both the web sidebar and web Settings' "Sync & devices"
 * card read instead of the hardcoded "Synced just now" string.
 * Best-effort and silent on failure: missing one stamp just means the
 * next successful drain (which happens on every reconnect/foreground
 * event) catches up.
 */
export async function touchDeviceSynced(userId: string): Promise<void> {
  const id = await getDeviceId()
  const { error } = await supabase
    .from('devices')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) {
    console.warn('[deviceRegistry] touchDeviceSynced failed:', error.message)
  }
}

/** This device's own `last_synced_at`, for the mobile Settings sync-health
 *  row (fix-plan 3.7 — "finish" the row 1.6 built with the one signal it
 *  was still missing: a true last-synced timestamp, not just pending/dead
 *  counts). Null on read failure or before the first successful drain. */
export async function getDeviceLastSynced(userId: string): Promise<string | null> {
  const id = await getDeviceId()
  const { data, error } = await supabase
    .from('devices')
    .select('last_synced_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data.last_synced_at
}

/** Test-only: clears the module-level id cache. */
export function __resetDeviceRegistryForTests(): void {
  cachedDeviceId = null
}
