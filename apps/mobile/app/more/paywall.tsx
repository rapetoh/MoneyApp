import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Typography, Colors } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

/**
 * Paywall — honest "Plus is in preview" state (audit fix-plan 3.1).
 *
 * There is no purchase flow in this build: no IAP/RevenueCat integration
 * exists yet, and `profiles.plus_status` has no automated writer, so
 * showing a price or an "Upgrade" button here would be a control that
 * looks interactive but cannot act — the exact defect class 3.1 exists
 * to close. This screen keeps the dark hero + feature list from
 * S_Paywall (docs/money-app/project/mobile-screens-4.jsx) — the layout
 * post-launch IAP will reuse — but the plan cards, the price strings
 * ($4.99/$39, which also contradicted the locked $3.99/$29.99 decision
 * in docs/PLAN.md), the "Upgrade to Plus" button and the disclaimer
 * that lied about the free tier being unlimited are gone. What's left
 * is a screen that describes Plus without promising a purchase the code
 * cannot complete.
 *
 * Entitlement (`usePlusStatus` → `profiles.plus_status === 'active'`) is
 * still granted manually for early access today, same as web. When real
 * purchases ship, this screen regains its plan cards and CTA.
 */
export default function PaywallScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const router = useRouter()

  const features = [
    t('paywall.feature_desktop', locale),
    t('paywall.feature_ask_murmur', locale),
    t('paywall.feature_auto_recurring', locale),
    t('paywall.feature_export', locale),
  ]

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {/* This is the app's one full-screen dark canvas (`root.backgroundColor`
          below is #0B0B0C) — the root layout's `<StatusBar style="dark" />`
          (audit 01-F22) leaves the clock/battery glyphs dark-on-dark here.
          Per-screen override, matching the fix-plan's "any screen with a
          dark canvas declares its own <StatusBar>" rule.
          Caveat (from the audit, unverified on a physical device in this
          environment): this screen is registered `presentation: 'modal'`
          (`_layout.tsx`) — a page-sheet on iOS — and a page-sheet's status
          bar is owned by the *presenting* view controller, so this
          override may be a no-op there. It is correct and takes effect on
          Android, where `presentation: 'modal'` doesn't carry that
          restriction. Switching to `fullScreenModal` would make the iOS
          case reliable too, at the cost of the sheet's swipe-to-dismiss
          and reveal-behind — a presentation change, not a status-bar fix,
          so it's left to whoever verifies this on-device. */}
      <StatusBar style="light" />
      <View style={styles.root}>
        {/* Radial-gradient-ish sage halo in the top-left */}
        <View pointerEvents="none" style={styles.halo} />

        <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
          {/* Close button — top right */}
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color={Colors.white} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.topPill}>
                <Ionicons name="sparkles" size={12} color={Colors.white} />
                <Text style={styles.topPillText}>{t('paywall.eyebrow', locale)}</Text>
              </View>
              <Text style={styles.headline}>{t('paywall.headline', locale)}</Text>
              <Text style={styles.body}>{t('paywall.body', locale)}</Text>
            </View>

            {/* Features */}
            <View style={styles.features}>
              {features.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={12} color={Colors.white} />
                  </View>
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Footer — no plan cards, no price, no CTA. Just the honest
              status: purchases aren't live yet. */}
          <View style={styles.bottom}>
            <Text style={styles.disclaimer}>{t('paywall.disclaimer', locale)}</Text>
          </View>
        </SafeAreaView>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B0B0C',
  },
  halo: {
    position: 'absolute',
    top: -160,
    left: -80,
    right: -80,
    height: 520,
    borderRadius: 520,
    backgroundColor: '#2b3a2b',
    opacity: 0.5,
  },
  safe: { flex: 1 },
  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: { opacity: 0.7 },
  scrollContent: {
    paddingBottom: 20,
  },
  hero: {
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  topPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.accent ?? Colors.primary,
  },
  topPillText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 38,
    fontWeight: '500',
    letterSpacing: -0.8,
    lineHeight: 42,
    color: Colors.white,
    marginTop: 22,
  },
  body: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    lineHeight: 23,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 14,
  },
  features: {
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accent ?? Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    flex: 1,
  },
  bottom: {
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 20,
  },
  disclaimer: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
    lineHeight: 18,
  },
})
