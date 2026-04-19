import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '../lib/supabase'

// Required on iOS so `openAuthSessionAsync` can complete after the redirect
// back to our app. Safe to call at module load.
WebBrowser.maybeCompleteAuthSession()

/**
 * Google Sign-In via Supabase's OAuth redirect flow (PKCE).
 *
 * Why this path instead of @react-native-google-signin/google-signin +
 * supabase.auth.signInWithIdToken:
 * - All versions of @react-native-google-signin/google-signin (including the
 *   current latest v16.1.2) lack a `nonce` parameter. The raw nonce is never
 *   passed to iOS's GIDSignIn.
 * - GIDSignIn auto-generates and embeds a random nonce in the id_token that
 *   the app cannot read.
 * - Supabase's `signInWithIdToken` requires the raw nonce to verify the hash.
 * - Result: the native library + signInWithIdToken combination is
 *   architecturally incompatible. The flow always fails with either
 *   "Passed nonce and nonce in id_token should either both exist or not"
 *   (if we omit the nonce) or "Nonces mismatch" (if we pass our own).
 *
 * The redirect flow below is Supabase's officially recommended React Native
 * pattern — it never touches `signInWithIdToken` and so sidesteps the nonce
 * incompatibility entirely. The browser sheet handles Google's auth; Supabase
 * issues a code we exchange for a session via PKCE.
 *
 * Requirements in Supabase dashboard (Authentication → URL Configuration):
 * - `voiceexpense://auth/callback` must be listed under "Redirect URLs".
 */
export async function signInWithGoogle() {
  const redirectTo = AuthSession.makeRedirectUri({
    scheme: 'voiceexpense',
    path: 'auth/callback',
  })
  console.log('[googleAuth] redirectTo =', redirectTo)

  const { data: authUrl, error: urlError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true, // we drive the browser ourselves via WebBrowser
    },
  })
  if (urlError) throw urlError
  if (!authUrl?.url) throw new Error('Supabase did not return an OAuth URL')
  console.log('[googleAuth] opening OAuth URL =', authUrl.url)

  const result = await WebBrowser.openAuthSessionAsync(authUrl.url, redirectTo)
  console.log('[googleAuth] WebBrowser result type =', result.type)

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Google sign-in cancelled')
  }
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in failed')
  }

  // PKCE flow: the redirect URL carries a ?code= we exchange for a session.
  const url = new URL(result.url)
  const code = url.searchParams.get('code')
  if (!code) throw new Error('No auth code in redirect URL')

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) throw error
  return data
}
