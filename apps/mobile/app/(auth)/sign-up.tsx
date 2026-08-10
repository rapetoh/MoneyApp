import { useState } from 'react'
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
import { Link } from 'expo-router'
import { getLocales } from 'expo-localization'
import { signUpWithEmail } from '../../src/hooks/useAuth'
import { MurmurMark } from '../../src/components/MurmurMark'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, resolveLocale } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'

/**
 * Email + password sign-up. Reachable from `/(auth)/sign-in` via the
 * "Create one" link inside the "More options" expandable. Most new users
 * are expected to choose Apple or Google on the sign-in screen and never
 * land here — this screen exists for users who explicitly want a managed
 * email/password account.
 */
export default function SignUpScreen() {
  // Same pre-auth device-locale seed as sign-in.tsx (audit 08-F48,
  // fix-plan 4.2) — no profile to read `locale` from yet.
  const locale: Locale = resolveLocale(getLocales().map((l) => l.languageCode))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSignUp() {
    if (!email || !password) return
    if (password.length < 6) {
      Alert.alert(t('auth.password_short', locale), t('auth.password_min', locale))
      return
    }
    setLoading(true)
    const { error } = await signUpWithEmail(email.trim(), password)
    setLoading(false)
    if (error) {
      Alert.alert(t('auth.sign_up_failed', locale), error.message)
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successInner}>
          <View style={styles.successTile}>
            <Text style={styles.successGlyph}>✓</Text>
          </View>
          <Text style={styles.headline}>{t('auth.check_email', locale)}</Text>
          <Text style={styles.lead}>{t('auth.confirmation_sent', locale)}</Text>
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <MurmurMark size={64} variant="sage" />


          <Text style={styles.headline}>{t('auth.create_account', locale)}</Text>
          <Text style={styles.lead}>{t('auth.track_voice', locale)}</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.email', locale)}
              placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.password_placeholder', locale)}
              placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={handleSignUp}
            />
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                (loading || !email || !password) && styles.btnDisabled,
                pressed && styles.btnPressed,
              ]}
              onPress={handleSignUp}
              disabled={loading || !email || !password}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>
                  {t('auth.create_account_btn', locale)}
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerHint}>{t('auth.has_account', locale)} </Text>
            <Link href="/(auth)/sign-in">
              <Text style={styles.footerLink}>{t('auth.sign_in_link', locale)}</Text>
            </Link>
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

  // MurmurMark renders its own tile + corner radius — no logoTile/logoGlyph
  // wrapping styles needed.

  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.8,
    color: Colors.ink ?? Colors.text,
    fontWeight: '500',
    marginTop: 28,
  },
  lead: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    fontFamily: Typography.fontFamily.sans,
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

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerHint: {
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sans,
  },
  footerLink: {
    fontSize: 13,
    color: Colors.accent ?? Colors.primary,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },

  // Success state
  successInner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 80,
    alignItems: 'center',
  },
  successTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successGlyph: {
    color: Colors.accent ?? Colors.primary,
    fontSize: 28,
    fontWeight: '800',
  },
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
