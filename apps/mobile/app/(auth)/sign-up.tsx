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
} from 'react-native'
import { Link } from 'expo-router'
import { signUpWithEmail } from '../../src/hooks/useAuth'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'

export default function SignUpScreen() {
  const locale: Locale = 'en'
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
      <View style={styles.container}>
        <View style={styles.successInner}>
          <Text style={styles.successIcon}>✉️</Text>
          <Text style={styles.title}>{t('auth.check_email', locale)}</Text>
          <Text style={styles.subtitle}>
            {t('auth.confirmation_sent', locale)}
          </Text>
          <Link href="/(auth)/sign-in" style={styles.backLink}>
            <Text style={styles.link}>{t('auth.back_to_sign_in', locale)}</Text>
          </Link>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.logo}>🎙</Text>
          <Text style={styles.title}>{t('auth.create_account', locale)}</Text>
          <Text style={styles.subtitle}>{t('auth.track_voice', locale)}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.email', locale)}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.password', locale)}</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.password_placeholder', locale)}
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              autoComplete="new-password"
            />
          </View>

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.create_account_btn', locale)}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.has_account', locale)} </Text>
          <Link href="/(auth)/sign-in">
            <Text style={styles.link}>{t('auth.sign_in_link', locale)}</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inner: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    gap: Spacing['2xl'],
  },
  successInner: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.base,
  },
  successIcon: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logo: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  title: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size['2xl'],
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    gap: Spacing.base,
  },
  field: {
    gap: Spacing.xs,
  },
  label: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  backLink: {
    marginTop: Spacing.base,
  },
  link: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
})
