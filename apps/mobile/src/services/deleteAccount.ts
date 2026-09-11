// Account deletion, one implementation for every surface that offers it.
//
// App Store guideline 5.1.1(v): an app that supports account creation
// must let the user delete the account, from inside the app, where a
// user (or a reviewer) looks for it. Murmur offers it twice, with the
// same flow: Settings > Account > Delete account, and Privacy Center >
// Your data > Delete account. Both call this.
//
// The `delete-user` Edge Function is the only path that can also remove
// the auth.users row (that needs the service-role key). It scrubs every
// table the user owns, then this side clears the local SQLite mirror and
// runs the regular sign-out teardown so a re-sign-up on the same device
// starts truly empty.
import { supabase } from '../lib/supabase'
import { wipeAllUserData } from './sync/transactionStore'
import { signOut } from '../hooks/useAuth'

export async function deleteAccount(userId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  const res = await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }

  // Server confirms the account is gone. Clear the local mirror, then the
  // regular sign-out (local teardown first, session revoke second). The
  // root layout's auth listener routes to /(auth)/sign-in when the session
  // clears; no manual navigation needed.
  await wipeAllUserData(userId)
  await signOut()
}
