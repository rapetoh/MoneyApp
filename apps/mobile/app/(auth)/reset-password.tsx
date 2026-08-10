import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { updatePassword } from '../../src/hooks/useAuth'
import { supabase } from '../../src/lib/supabase'
import { MurmurMark } from '../../src/components/MurmurMark'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'

/**
 * Password reset, step 2 — fix-plan 3.2 / audit 08-F7.
 *
 * Reached via the `voiceexpense://reset-password?code=…` link
 * `requestPasswordReset` (useAuth.ts) emails out. Expo Router resolves
 * that deep link to this screen with `code` as a search param — no
 * manual `Linking` parsing needed, which also sidesteps the
 * hostname-vs-path ambiguity fix-plan 3.4 fixes for `useShortcutHandler`
 * (Router's own URL-to-route resolver folds host and path together, so
 * it isn't affected by that bug).
 *
 * `exchangeCodeForSession` trades the one-time code for a real session
 * scoped to the account being recovered — the user is technically
 * signed in at that point, but hasn't set a new password yet, so this
 * screen (not the root layout's tab bar) must be what they see next.
 * The root layout's session-based redirect exempts this one route for
 * exactly that reason (see `app/_layout.tsx`).
 */
export default function ResetPasswordScreen() {
  const locale: Locale = 'en'
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string }>()

  const [status, setStatus] = useState<'exchanging' | 'ready' | 'invalid'>('exchanging')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const code = params.code
    if (!code) {
      setStatus('invalid')
      return
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      setStatus(error ? 'invalid' : 'ready')
    })
  }, [params.code])

  async function handleSubmit() {
    if (password.length < 6) {
      Alert.alert(t('auth.password_short', locale), t('auth.password_min', locale))
      return
    }
    if (password !== confirmPassword) {
      Alert.alert(t('auth.reset_failed', locale), t('auth.passwords_no_match', locale))
      return
    }
    setSubmitting(true)
    const { error } = await updatePassword(password)
    setSubmitting(false)
    if (error) {
      Alert.alert(t('auth.reset_failed', locale), error.message)
      return
    }
    Alert.alert(t('auth.password_updated', locale))
    router.replace('/(tabs)')
  }

  if (status === 'exchanging') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerInner}>
          <ActivityIndicator color={Colors.accent ?? Colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (status === 'invalid') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerInner}>
          <Text style={styles.headline}>{t('auth.reset_failed', locale)}</Text>
          <Text style={styles.lead}>{t('auth.reset_link_invalid', locale)}</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}>
              <Text style={styles.backBtnText}>{t('auth.back_to_sign_in', locale)}</Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <MurmurMark size={64} variant="sage" />

          <Text style={styles.headline}>{t('auth.new_password_title', locale)}</Text>
          <Text style={styles.lead}>{t('auth.new_password_body', locale)}</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.password_placeholder', locale)}
              placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="next"
              testID="reset-password"
            />
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('auth.confirm_password', locale)}
              placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              testID="reset-password-confirm"
            />
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                (submitting || !password || !confirmPassword) && styles.btnDisabled,
                pressed && styles.btnPressed,
              ]}
              onPress={handleSubmit}
              disabled={submitting || !password || !confirmPassword}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>{t('auth.update_password', locale)}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 32,
  },
  centerInner: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: Colors.ink ?? Colors.text,
    fontWeight: '500',
    marginTop: 24,
    textAlign: 'center',
  },
  lead: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    fontFamily: Typography.fontFamily.sans,
    textAlign: 'center',
  },
  form: { marginTop: 32, gap: 10 },
  input: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    fontSize: 15,
    color: Colors.ink ?? Colors.text,
    fontFamily: Typography.fontFamily.sans,
  },
  submitBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.accent ?? Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.5 },
  backBtn: {
    marginTop: 32,
    height: 50,
    paddingHorizontal: 32,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.ink ?? '#1B1915',
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },
})
