import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { supabase } from '../lib/supabase'

// Required: finishes the auth session when the browser redirects back
WebBrowser.maybeCompleteAuthSession()

export async function signInWithGoogle() {
  // Build the redirect URL — Supabase will redirect here after Google OAuth
  const redirectUrl = AuthSession.makeRedirectUri({
    scheme: 'voiceexpense',
    path: 'auth/callback',
  })

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true, // We handle the browser manually below
    },
  })

  if (error || !data.url) throw error ?? new Error('No OAuth URL returned')

  // Open Google's OAuth page in a browser
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)

  if (result.type !== 'success') {
    // User cancelled or error — not a fatal error
    return null
  }

  // Extract the session from the redirect URL's fragment
  const url = new URL(result.url)
  const accessToken = url.searchParams.get('access_token') ?? extractFromFragment(result.url, 'access_token')
  const refreshToken = url.searchParams.get('refresh_token') ?? extractFromFragment(result.url, 'refresh_token')

  if (accessToken && refreshToken) {
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (sessionError) throw sessionError
    return sessionData
  }

  return null
}

function extractFromFragment(url: string, key: string): string | null {
  try {
    const fragment = url.split('#')[1] ?? ''
    const params = new URLSearchParams(fragment)
    return params.get(key)
  } catch {
    return null
  }
}
