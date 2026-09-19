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

  // Apple sends the user's name only on the very first authorization and
  // never again (first-run audit H7). Before this, it was requested and
  // dropped, so the profile fell back to the email prefix (a random
  // string for "Hide My Email"). Save it the one time it exists.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(' ')
    .trim()
  if (fullName && data.user) {
    await Promise.all([
      supabase.from('profiles').update({ display_name: fullName }).eq('id', data.user.id),
      supabase.auth.updateUser({ data: { full_name: fullName } }),
    ]).catch((e) => console.warn('[appleAuth] could not save name', e))
  }
  return data
}
