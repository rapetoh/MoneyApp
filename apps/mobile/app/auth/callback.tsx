import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getLocales } from 'expo-localization'
import { supabase } from '../../src/lib/supabase'
import { Colors, Typography } from '../../src/theme'
import { t, resolveLocale, type Locale } from '@voice-expense/shared'

/**
 * Landing for the email-confirmation link (first-run audit M1).
 *
 * Sign-up now sends `voiceexpense://auth/callback` as the confirmation
 * redirect, so tapping the link in the email comes back into the app
 * instead of stranding the user on the website. The PKCE code is
 * exchanged for a session here and the root gate takes over (onboarding
 * for a new account). If the exchange can't happen on this device (link
 * opened on another phone, code already used), the email is still
 * confirmed server-side: the screen says so and offers sign-in.
 */
export default function AuthCallbackScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string }>()
  const locale: Locale = resolveLocale(getLocales().map((l) => l.languageCode))
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        router.replace('/')
        return
      }
      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code)
        if (!error) {
          router.replace('/')
          return
        }
      }
      if (alive) setConfirmed(true)
    })()
    return () => {
      alive = false
    }
  }, [params.code, router])

  if (!confirmed) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <View style={styles.tile}>
          <Ionicons name="checkmark" size={30} color={Colors.accent} />
        </View>
        <Text style={styles.title}>{t('auth.email_confirmed', locale)}</Text>
        <Text style={styles.body}>{t('auth.email_confirmed_body', locale)}</Text>
        <Pressable
          onPress={() => router.replace('/(auth)/sign-in')}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{t('auth.sign_in', locale)}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  tile: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 22, fontFamily: Typography.fontFamily.serif, fontSize: 30, color: Colors.ink, fontWeight: '500' },
  body: { marginTop: 8, fontSize: 15, color: Colors.ink3, fontFamily: Typography.fontFamily.sans, textAlign: 'center' },
  cta: {
    marginTop: 28,
    height: 52,
    paddingHorizontal: 36,
    borderRadius: 26,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: Colors.white, fontSize: 16, fontWeight: '600', fontFamily: Typography.fontFamily.sansSemiBold },
})
