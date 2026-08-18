import { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Linking, Pressable, AppState } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t, SHORTCUT_INSTALL_URL, type Locale } from '@voice-expense/shared'
import {
  getNotificationPermission,
  requestNotificationPermission,
} from '../../src/services/walletCaptureNotifications'

/**
 * Apple Pay capture — guided setup (Aug 17, 2026).
 *
 * Apple exposes no API to read Wallet transactions; the only sanctioned
 * path is a Shortcuts *Wallet* automation ("When I tap a Wallet card or
 * pass") that runs an app action. Personal automations cannot be shared
 * or installed on someone else's phone (Apple), so every user creates it
 * once — this screen is the six taps, in order, with Murmur's own action
 * ("Log Expense in Murmur", native/ios/WalletCapture.swift) as the step
 * that does the work. After that: pay → saved in the background → banner.
 * Same set-up model as MonAi and every other tracker.
 */
export default function ApplePaySetupScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale

  const steps = [1, 2, 3, 4, 5, 6].map((n) => t(`applepay.step_${n}`, locale))

  // Notification permission — the confirmation banner ("Saved $2.11 ·
  // Merchant", Undo / Edit) needs it. Re-checked on foreground so a
  // change made in iOS Settings shows immediately.
  const [notif, setNotif] = useState<'granted' | 'denied' | 'undetermined' | null>(null)
  const refresh = useCallback(() => {
    getNotificationPermission()
      .then(setNotif)
      .catch(() => setNotif('undetermined'))
  }, [])
  useEffect(() => {
    refresh()
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh())
    return () => sub.remove()
  }, [refresh])

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="wallet-outline" size={22} color={Colors.accent} />
          </View>
          <Text style={styles.title}>{t('applepay.title', locale)}</Text>
          <Text style={styles.body}>{t('applepay.body', locale)}</Text>
        </View>

        {notif && notif !== 'granted' && (
          <View style={styles.notifCard}>
            <Text style={styles.notifTitle}>{t('applepay.notif_title', locale)}</Text>
            <Text style={styles.notifBody}>
              {t(notif === 'denied' ? 'applepay.notif_denied' : 'applepay.notif_body', locale)}
            </Text>
            <Pressable
              onPress={() =>
                notif === 'denied'
                  ? Linking.openSettings()
                  : requestNotificationPermission().then(() => refresh())
              }
              style={({ pressed }) => [styles.notifBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.notifBtnText}>{t('applepay.notif_allow', locale)}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('applepay.steps_label', locale)}</Text>
          {steps.map((s, i) => (
            <View key={i} style={[styles.step, i === steps.length - 1 && styles.stepLast]}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => Linking.openURL('shortcuts://create-automation')}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Ionicons name="open-outline" size={16} color={Colors.white} />
          <Text style={styles.ctaText}>{t('applepay.open_shortcuts', locale)}</Text>
        </Pressable>

        {SHORTCUT_INSTALL_URL ? (
          <Pressable
            onPress={() => Linking.openURL(SHORTCUT_INSTALL_URL)}
            style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.secondaryText}>{t('applepay.install_shortcut', locale)}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.footnote}>{t('applepay.footnote', locale)}</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.lg, paddingBottom: 32 },
  hero: { gap: 8, paddingTop: 4 },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 26,
    fontWeight: '500',
    letterSpacing: -0.5,
    color: Colors.ink ?? Colors.text,
  },
  body: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  card: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: 4,
  },
  cardLabel: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  step: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(40,36,28,0.10)',
  },
  stepLast: { borderBottomWidth: 0 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontFamily: Typography.fontFamily.sansBold, fontSize: 12, color: Colors.white },
  stepText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.ink ?? Colors.text,
    lineHeight: 22,
  },
  cta: {
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: Typography.fontFamily.sansBold, fontSize: 15, color: Colors.white },
  secondary: { alignItems: 'center', paddingVertical: 8 },
  secondaryText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.accent,
  },
  notifCard: {
    backgroundColor: Colors.accentSoft,
    borderRadius: Radius.card,
    padding: Spacing.base,
    gap: 6,
  },
  notifTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    color: Colors.ink ?? Colors.text,
  },
  notifBody: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  notifBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.accent,
  },
  notifBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13,
    color: Colors.white,
  },
  footnote: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
})
