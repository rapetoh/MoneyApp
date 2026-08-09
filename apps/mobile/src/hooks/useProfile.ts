import { useEffect, useState, useCallback, useRef } from 'react'
import { getCalendars } from 'expo-localization'
import { supabase } from '../lib/supabase'
import { DataEvents } from '../events/dataEvents'
import { setCurrentProfileCurrency } from '../services/profileCurrency'
import type { Profile, ProfileUpdate } from '@voice-expense/shared'

// On fresh sign-up, the profile row is created by a server-side trigger
// (handle_new_user). That trigger fires asynchronously from the client's
// perspective — a fetch immediately after sign-up can return null for a
// brief window. Without a retry, the app sees `profile === null` and the
// routing gate in _layout.tsx can't tell the difference between "new user,
// row about to appear" and "error, give up". We retry on a short delay
// until we see a row or hit the budget.
const PROFILE_RETRY_INTERVAL_MS = 250
const PROFILE_RETRY_BUDGET_MS = 5_000

/** IANA zone the device is currently in, e.g. "America/Chicago". Null on
 *  a platform/runtime that can't answer (web fallback, simulator quirk) —
 *  callers must treat that as "don't know", never coerce to UTC. */
function getDeviceTimeZone(): string | null {
  try {
    return getCalendars()[0]?.timeZone ?? null
  } catch {
    return null
  }
}

/**
 * `profiles.timezone` (fix-plan 1.3, part 1) — declared in the schema
 * since migration 001, written by nothing until now, so every
 * production profile reads the column default 'UTC' regardless of
 * where the user actually is (audit 04-F4). Zones change when people
 * travel, so this runs on every authenticated launch, not just once at
 * sign-up: a silent, fire-and-forget correction, never blocking the
 * profile read path it rides in on. A transient failure just means the
 * next launch tries again — there is nothing here worth retrying
 * eagerly or surfacing to the user.
 */
function captureDeviceTimezone(userId: string, storedTimezone: string): void {
  const deviceTz = getDeviceTimeZone()
  if (!deviceTz || deviceTz === storedTimezone) return
  supabase
    .from('profiles')
    .update({ timezone: deviceTz })
    .eq('id', userId)
    .then(({ error }) => {
      if (error) {
        console.warn('[useProfile] failed to capture device timezone', error.message)
      }
    })
}

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryStartRef = useRef<number | null>(null)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data as Profile)
      // Keep the in-memory profile-currency cache in sync so write
      // paths (createTransaction, recurringCatchUp) can snapshot FX
      // without prop-drilling. See services/profileCurrency.ts.
      setCurrentProfileCurrency((data as Profile).currency_code)
      setLoading(false)
      retryStartRef.current = null
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      captureDeviceTimezone(userId, (data as Profile).timezone)
      return
    }

    // No row yet — keep loading=true and retry until the server-side
    // trigger lands, or until we've been at this for PROFILE_RETRY_BUDGET_MS
    // at which point we give up and let the UI flow with a null profile.
    const now = Date.now()
    if (retryStartRef.current == null) retryStartRef.current = now
    const elapsed = now - retryStartRef.current

    if (elapsed >= PROFILE_RETRY_BUDGET_MS) {
      setProfile(null)
      setLoading(false)
      retryStartRef.current = null
      return
    }

    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    retryTimerRef.current = setTimeout(fetch, PROFILE_RETRY_INTERVAL_MS)
  }, [userId])

  useEffect(() => {
    fetch()
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [fetch])

  // Reload when another screen updates the profile (e.g. language/currency change)
  useEffect(() => {
    if (!userId) return
    return DataEvents.onProfile(userId, fetch)
  }, [userId, fetch])

  async function updateProfile(updates: ProfileUpdate) {
    if (!userId) return false
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
    if (!error) {
      await fetch()
      DataEvents.emitProfile(userId)
    }
    return !error
  }

  return { profile, loading, updateProfile, refetch: fetch }
}
