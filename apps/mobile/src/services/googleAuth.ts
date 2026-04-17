import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { supabase } from '../lib/supabase'

GoogleSignin.configure({
  // Web client ID — used by Supabase to verify the ID token
  webClientId: '1092158800862-ndbjsv5hr5l2eqf4bpgiqk8h48actjs3.apps.googleusercontent.com',
  // iOS client ID — required for native Google Sign-In on iOS
  iosClientId: '1092158800862-pe2oj85tpofl4ccr2pdgd2luobt2gojq.apps.googleusercontent.com',
})

export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices()
  const response = await GoogleSignin.signIn()
  const idToken = response.data?.idToken
  if (!idToken) throw new Error('No ID token returned from Google Sign-In')

  // Sign in with ID token only — no nonce.
  // @react-native-google-signin/google-signin v14 does NOT support passing
  // a nonce to signIn(). The parameter is silently ignored, so Google never
  // embeds a nonce in the JWT. Passing a nonce to Supabase then causes a
  // "Nonces mismatch" error because Supabase expects to find one in the
  // token but there is none.
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (error) throw error
  return data
}
