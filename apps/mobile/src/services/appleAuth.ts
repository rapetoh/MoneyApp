import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from '../lib/supabase'

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  })

  if (!credential.identityToken) {
    throw new Error('Apple Sign-In: no identity token returned')
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  })

  if (error) throw error
  return data
}

export async function isAppleAuthAvailable() {
  return AppleAuthentication.isAvailableAsync()
}
