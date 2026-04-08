import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { supabase } from '../lib/supabase'

// Required: closes the browser when it redirects back to the app
WebBrowser.maybeCompleteAuthSession()

export async function signInWithGoogle() {
  const redirectUrl = AuthSession.makeRedirectUri({
    scheme: 'voiceexpense',
    path: 'auth/callback',
  })

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    },
  })

  if (error || !data.url) throw error ?? new Error('No OAuth URL returned')

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)

  if (result.type !== 'success') return null

  // Supabase PKCE flow returns ?code=xxx — exchange it for a session
  if (result.url.includes('code=')) {
    const { data: session, error: sessionError } =
      await supabase.auth.exchangeCodeForSession(result.url)
    if (sessionError) throw sessionError
    return session
  }

  // Fallback: implicit flow returns #access_token=xxx&refresh_token=xxx
  const fragment = result.url.split('#')[1] ?? ''
  const params = new URLSearchParams(fragment)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (accessToken && refreshToken) {
    const { data: session, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (sessionError) throw sessionError
    return session
  }

  return null
}
