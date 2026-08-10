import { supabase, removePersistedAuthSession } from '../lib/supabase'
import { useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import * as AuthSession from 'expo-auth-session'
import type { Session, User } from '@supabase/supabase-js'
import { syncManager } from '../services/sync/SyncManager'
import { wipeLocalDatabase } from '../services/sync/localDb'
import { setCurrentProfileCurrency } from '../services/profileCurrency'
import { cancelDayTwo } from '../services/dayTwoDunning'
import { clearParseCache } from '@voice-expense/ai'

/**
 * Per-user SecureStore keys, mirrored from the modules that own them
 * (each keeps its key constant private). Anything listed here is deleted
 * by `resetLocalState` so the next account starts from a blank slate.
 */
const PER_USER_SECURE_KEYS = [
  'insights_unlocked_seen', // src/hooks/useInsightsUnlock.ts
  'api_base_url', // src/hooks/useApiUrl.ts
  'day_two_permission_asked', // src/services/dayTwoDunning.ts
  'day_two_user_opted_out', // src/services/dayTwoDunning.ts
  'recurring_pattern_dismissed_v1', // src/components/RecurringPatternBanner.tsx
]

/**
 * Full local teardown, run whenever the session ends: `signOut` below
 * calls it directly and unconditionally (it does not wait for, or depend
 * on, the network round trip), and the module-level SIGNED_OUT listener
 * below calls it too — the only path when supabase-js drops an expired
 * or invalid refresh token on its own, and a harmless idempotent re-run
 * when `signOut`'s own network call goes on to succeed. Afterwards
 * nothing the signed-out account left on the device is readable: SQLite
 * rows, queued sync operations, the in-memory profile-currency cache,
 * the pending day-2 notification, and the per-user SecureStore keys.
 */
export async function resetLocalState(): Promise<void> {
  // Stop first: bumps the drain epoch so an in-flight queue drain halts
  // before it can push another of the old account's entries.
  syncManager.stop()
  await wipeLocalDatabase()
  setCurrentProfileCurrency('USD')
  // The parse cache (packages/ai/src/parser.ts) is a module-level `Map`
  // keyed in part on user id (fix-plan 1.7 / audit 02-F24) — clearing it
  // here is belt-and-suspenders against any entry written before that key
  // change reaches every build, and against the very first parse this
  // session having run before sign-in resolved a `userId` to key on.
  clearParseCache()
  // The day-2 nudge was scheduled for the old account; cancelling also
  // drops its persisted notification id.
  await cancelDayTwo()
  await Promise.all(PER_USER_SECURE_KEYS.map((key) => SecureStore.deleteItemAsync(key)))
  // _layout.tsx starts the SyncManager exactly once on mount, so the
  // teardown must hand back a running instance for the next sign-in.
  syncManager.start()
}

// Module scope, not hook scope: exactly one registration per JS runtime,
// firing no matter which screen triggered the sign-out — and also when
// auth-js discards a session it could not refresh.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    resetLocalState().catch((err) => {
      console.warn('[auth] sign-out teardown failed', err)
    })
  }
  if (event === 'SIGNED_IN') {
    // An offline forced sign-out (below) stops the refresh timer to keep it
    // from re-persisting the discarded session; every sign-in path funnels
    // through this event, so this is the one place to restart it.
    void supabase.auth.startAutoRefresh()
  }
})

// An offline sign-out never produces a SIGNED_OUT event (auth-js only emits
// it after a successful /logout round trip), so routing — which gates on
// useAuth's session state — would keep the app open as the old account.
// This local signal lets signOut() force every mounted useAuth to null out
// immediately, without pretending the server call succeeded.
const forcedSignOutListeners = new Set<() => void>()

function notifyForcedSignOut() {
  forcedSignOutListeners.forEach((listener) => listener())
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    const onForcedSignOut = () => {
      setSession(null)
      setUser(null)
    }
    forcedSignOutListeners.add(onForcedSignOut)

    return () => {
      subscription.unsubscribe()
      forcedSignOutListeners.delete(onForcedSignOut)
    }
  }, [])

  return { session, user, loading }
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUpWithEmail(email: string, password: string) {
  return supabase.auth.signUp({ email, password })
}

/**
 * Password reset, step 1 — fix-plan 3.2 / audit 08-F7 ("no password-reset
 * flow anywhere in the product"). Sends the Supabase recovery email with a
 * PKCE `redirectTo` back into this app; `app/(auth)/reset-password.tsx`
 * consumes the `?code=` param it lands with, exchanges it for a session,
 * and calls `updatePassword` below.
 *
 * The `voiceexpense://reset-password` redirect must be listed under
 * Supabase Auth → URL Configuration → Redirect URLs, the same as
 * `voiceexpense://auth/callback` (see `services/googleAuth.ts`).
 */
export async function requestPasswordReset(email: string) {
  const redirectTo = AuthSession.makeRedirectUri({
    scheme: 'voiceexpense',
    path: 'reset-password',
  })
  return supabase.auth.resetPasswordForEmail(email, { redirectTo })
}

/** Password reset, step 2 — called from the reset-password screen once the
 *  recovery code has been exchanged for a session. */
export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password })
}

export async function signOut() {
  // Capture the session before anything below can invalidate it — this
  // is the only chance to know who was signed in.
  const { data: { session } } = await supabase.auth.getSession()

  // Run the local teardown unconditionally, *before* touching the
  // network. Even with scope: 'local', supabase-js's `_signOut` still
  // POSTs to `/logout` and — offline, or on any network failure — returns
  // an error without calling `_removeSession()`, so it never emits the
  // SIGNED_OUT event the module-level listener above hangs off. Gating
  // the teardown behind that event (or behind this call succeeding) would
  // leave account A's SQLite rows, queue entries, and cached currency on
  // the device wherever the device happens to be offline. A teardown
  // failure must not block the attempt to revoke the session below.
  try {
    await resetLocalState()
  } catch (err) {
    console.warn('[auth] local teardown failed during sign-out', err)
  }

  if (!session) return

  let signedOutCleanly = false
  try {
    // On success this also (harmlessly) re-fires SIGNED_OUT, re-running
    // the now-idempotent teardown above.
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    signedOutCleanly = !error
    if (error) {
      console.warn('[auth] server-side signOut failed; forcing local session removal', error)
    }
  } catch (err) {
    // Swallow and report — never resurrect the state just discarded.
    console.warn('[auth] server-side signOut threw; forcing local session removal', err)
  }

  if (!signedOutCleanly) {
    // auth-js only clears its persisted session after a successful /logout
    // (or a 401/403/404); a network failure leaves the session stored, the
    // refresh timer armed, and no SIGNED_OUT event — the app would stay
    // signed in as the old account. Force all three by hand:
    // stop the refresh timer so a later reconnect cannot re-persist the
    // discarded session, delete the stored token, and flip routing now.
    void supabase.auth.stopAutoRefresh()
    try {
      await removePersistedAuthSession()
    } catch (err) {
      console.warn('[auth] persisted session removal failed', err)
    }
    notifyForcedSignOut()
  }
}
