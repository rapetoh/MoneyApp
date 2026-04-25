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
import { Link, useRouter } from 'expo-router'
import * as AppleAuthentication from 'expo-apple-authentication'
import { Ionicons } from '@expo/vector-icons'
import { signInWithEmail } from '../../src/hooks/useAuth'
import { signInWithApple } from '../../src/services/appleAuth'
import { signInWithGoogle } from '../../src/services/googleAuth'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

// Three value props that double as the welcome pitch. Same source of truth as
// the prior (onboarding)/welcome.tsx — that screen has been retired and its
// content lives here so the user sees the pitch on the same surface as the
// one-tap auth CTA, not as a separate step.
const PROPS: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  titleKey: string
  subKey: string
}[] = [
  { icon: 'mic', titleKey: 'onboarding.welcome.prop_voice_title', subKey: 'onboarding.welcome.prop_voice_sub' },
  { icon: 'lock-closed', titleKey: 'onboarding.welcome.prop_nobank_title', subKey: 'onboarding.welcome.prop_nobank_sub' },
  { icon: 'analytics', titleKey: 'onboarding.welcome.prop_desktop_title', subKey: 'onboarding.welcome.prop_desktop_sub' },
]

/**
 * Welcome + Sign-in (combined).
 *
 * Phase F decision (2026-04-25): the design doc calls for "lazy identity / no
 * sign-in wall", but for a financial app the data-loss risk on reinstall makes
 * a strict no-wall stance dangerous. Override: keep the wall but make it one
 * tap. Sign In with Apple is the iOS hero (Apple guideline 4.8 also makes it
 * required when offering any third-party sign-in); Google is the Android
 * hero. Email/password is collapsed under "More options" for users who want
 * it. The "Speak it. Spend clearly." pitch sits above the CTA so the user
 * sees product value AND the one-tap entry on the same surface.
 */
export default function WelcomeSignInScreen() {
  // Locale source: pre-auth, the user has no Supabase profile yet, so we fall
  // back to English. The full locale picker lives in Settings + onboarding's
  // income step — both reachable post-sign-in.
  const locale: Locale = 'en'
  const router = useRouter()

  const [appleAvailable, setAppleAvailable] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // Apple auth is iOS-only; on Android the AppleAuthenticationButton renders
  // nothing and we surface SIWA via a styled button that hands off to the web
  // OAuth flow. (Android's native option is Google — that one ships
  // unconditionally below.)
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable)
  }, [])

  async function handleAppleSignIn() {
    try {
      setLoading(true)
      await signInWithApple()
    } catch (err) {
      const e = err as { code?: string; message?: string }
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert(t('auth.apple_failed', locale), e.message ?? '')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    try {
      setLoading(true)
      await signInWithGoogle()
    } catch (err) {
      const e = err as { message?: string }
      Alert.alert(t('auth.google_failed', locale), e.message ?? '')
    } finally {
      setLoading(false)
    }
  }

  async function handleEmailSignIn() {
    if (!email || !password) return
    setLoading(true)
    const { error } = await signInWithEmail(email.trim(), password)
    setLoading(false)
    if (error) Alert.alert(t('auth.sign_in_failed', locale), error.message)
  }

  // Platform-aware CTA order: SIWA hero on iOS (and only iOS — guideline 4.8
  // requires it whenever a third-party sign-in is offered there), Google hero
  // on Android. Both providers are still reachable on both platforms; ordering
  // just matches the platform's native default.
  const isIOS = Platform.OS === 'ios'

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={isIOS ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Sage M tile — same brand mark as the retired welcome.tsx */}
          <View style={styles.logoTile}>
            <Text style={styles.logoGlyph}>M</Text>
          </View>

          <Text style={styles.headline}>{t('onboarding.welcome.headline', locale)}</Text>
          <Text style={styles.lead}>{t('onboarding.welcome.lead', locale)}</Text>

          <View style={styles.props}>
            {PROPS.map((p) => (
              <View key={p.titleKey} style={styles.propRow}>
                <View style={styles.propIconTile}>
                  <Ionicons
                    name={p.icon}
                    size={18}
                    color={Colors.accent ?? Colors.primary}
                  />
                </View>
                <View style={styles.propTextWrap}>
                  <Text style={styles.propTitle}>{t(p.titleKey, locale)}</Text>
                  <Text style={styles.propSub}>{t(p.subKey, locale)}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Auth CTA stack — order swaps by platform */}
          <View style={styles.ctaStack}>
            {isIOS && appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={28}
                style={styles.appleHeroBtn}
                onPress={handleAppleSignIn}
              />
            )}

            <Pressable
              style={({ pressed }) => [
                isIOS ? styles.googleSecondaryBtn : styles.googleHeroBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={handleGoogleSignIn}
              disabled={loading}
            >
              <Text
                style={
                  isIOS ? styles.googleSecondaryText : styles.googleHeroText
                }
              >
                {t('auth.continue_google', locale)}
              </Text>
            </Pressable>

            {!isIOS && appleAvailable && (
              <Pressable
                style={({ pressed }) => [styles.appleSecondaryBtn, pressed && styles.btnPressed]}
                onPress={handleAppleSignIn}
                disabled={loading}
              >
                <Text style={styles.appleSecondaryText}>
                  {t('auth.continue_apple', locale)}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => setShowEmailForm((s) => !s)}
              style={({ pressed }) => [styles.moreOptionsBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.moreOptionsText}>
                {showEmailForm
                  ? t('auth.hide_email_form', locale)
                  : t('auth.more_options', locale)}
              </Text>
            </Pressable>

            {showEmailForm && (
              <View style={styles.emailForm}>
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
                  placeholder={t('auth.password', locale)}
                  placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
                  secureTextEntry
                  autoComplete="current-password"
                  returnKeyType="go"
                  onSubmitEditing={handleEmailSignIn}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.emailSubmitBtn,
                    (loading || !email || !password) && styles.btnDisabled,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={handleEmailSignIn}
                  disabled={loading || !email || !password}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.emailSubmitText}>
                      {t('auth.sign_in', locale)}
                    </Text>
                  )}
                </Pressable>
                <View style={styles.signUpRow}>
                  <Text style={styles.signUpHint}>
                    {t('auth.no_account', locale)}{' '}
                  </Text>
                  <Link href="/(auth)/sign-up">
                    <Text style={styles.signUpLink}>
                      {t('auth.create_one', locale)}
                    </Text>
                  </Link>
                </View>
              </View>
            )}
          </View>

          <Text style={styles.privacyNote}>{t('auth.privacy_note', locale)}</Text>
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

  // Brand mark + headline + lead
  logoTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.accent ?? Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent ?? Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoGlyph: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    fontFamily: Typography.fontFamily.sansBold,
    letterSpacing: -1,
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1,
    color: Colors.ink ?? Colors.text,
    fontWeight: '500',
    marginTop: 28,
  },
  lead: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14,
    fontFamily: Typography.fontFamily.sans,
  },

  // Three value props
  props: { marginTop: 32, gap: 16 },
  propRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  propIconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propTextWrap: { flex: 1 },
  propTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
    letterSpacing: -0.2,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  propSub: {
    fontSize: 13.5,
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 2,
    lineHeight: 19,
    fontFamily: Typography.fontFamily.sans,
  },

  // CTA stack
  ctaStack: { marginTop: 36, gap: 10 },

  // iOS hero — Apple-styled native button
  appleHeroBtn: { width: '100%', height: 54 },
  // Android secondary — styled SIWA button (web OAuth flow)
  appleSecondaryBtn: {
    height: 54,
    borderRadius: 28,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleSecondaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    letterSpacing: -0.2,
  },

  // Android hero — bold ink Google button
  googleHeroBtn: {
    height: 54,
    borderRadius: 28,
    backgroundColor: Colors.ink ?? '#1B1915',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleHeroText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    letterSpacing: -0.2,
  },
  // iOS secondary — outlined Google button (white card with hairline)
  googleSecondaryBtn: {
    height: 54,
    borderRadius: 28,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleSecondaryText: {
    color: Colors.ink ?? Colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    letterSpacing: -0.2,
  },

  // "More options" toggle
  moreOptionsBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  moreOptionsText: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },

  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.5 },

  // Email form (shown when "More options" expanded)
  emailForm: { gap: 10 },
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
  emailSubmitBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.accent ?? Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailSubmitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },
  signUpRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  signUpHint: {
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sans,
  },
  signUpLink: {
    fontSize: 13,
    color: Colors.accent ?? Colors.primary,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },

  privacyNote: {
    marginTop: 20,
    fontSize: 12,
    color: Colors.ink4 ?? Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: Typography.fontFamily.sans,
  },
})
