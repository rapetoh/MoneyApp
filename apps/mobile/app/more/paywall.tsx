import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Typography, Colors } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

/**
 * Paywall — matches S_Paywall in docs/money-app/project/mobile-screens-4.jsx.
 *
 *   - Dark canvas with a radial sage-tinted gradient in the top-left
 *     (approximated with a large absolutely-positioned radial-gradient-ish
 *     tint view since RN doesn't support CSS radial gradients natively —
 *     close enough for a tinted glow).
 *   - Hero: sage "Murmur Plus · Desktop" pill → serif 38px headline →
 *     muted white body copy.
 *   - 4 feature rows with sage check bullets.
 *   - Two PlanCards (monthly + yearly, yearly featured with "BEST" badge).
 *   - White Upgrade button.
 *   - Footer disclaimer.
 *
 * Upgrade currently does nothing (no IAP yet). The plan toggle is wired
 * with local state so tapping a card actually highlights it.
 */
export default function PaywallScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const router = useRouter()
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('yearly')

  const features = [
    t('paywall.feature_desktop', locale),
    t('paywall.feature_ask_murmur', locale),
    t('paywall.feature_auto_recurring', locale),
    t('paywall.feature_export', locale),
  ]

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
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

          {/* Bottom: plan cards + upgrade button + disclaimer */}
          <View style={styles.bottom}>
            <View style={styles.planRow}>
              <PlanCard
                period={t('paywall.plan_monthly', locale)}
                price="$4.99"
                sub={t('paywall.plan_monthly_sub', locale)}
                selected={plan === 'monthly'}
                onPress={() => setPlan('monthly')}
              />
              <PlanCard
                period={t('paywall.plan_yearly', locale)}
                price="$39"
                sub={t('paywall.plan_yearly_sub', locale)}
                selected={plan === 'yearly'}
                best={t('paywall.best', locale)}
                onPress={() => setPlan('yearly')}
              />
            </View>

            <Pressable
              style={({ pressed }) => [styles.upgradeBtn, pressed && styles.upgradeBtnPressed]}
              onPress={() => {
                // Purchase flow isn't wired yet. Keep the button responsive so the
                // pressed state reads; actual subscription logic is post-Phase D.
              }}
            >
              <Text style={styles.upgradeBtnText}>{t('paywall.cta', locale)}</Text>
            </Pressable>

            <Text style={styles.disclaimer}>{t('paywall.disclaimer', locale)}</Text>
          </View>
        </SafeAreaView>
      </View>
    </>
  )
}

function PlanCard({
  period,
  price,
  sub,
  selected,
  best,
  onPress,
}: {
  period: string
  price: string
  sub: string
  selected?: boolean
  best?: string
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        planStyles.card,
        selected && planStyles.cardSelected,
        pressed && planStyles.cardPressed,
      ]}
    >
      {best && (
        <View style={planStyles.bestBadge}>
          <Text style={planStyles.bestBadgeText}>{best}</Text>
        </View>
      )}
      <Text style={planStyles.period}>{period}</Text>
      <Text style={planStyles.price}>{price}</Text>
      <Text style={planStyles.sub}>{sub}</Text>
    </Pressable>
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  planRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  upgradeBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtnPressed: { opacity: 0.85 },
  upgradeBtnText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 17,
    fontWeight: '700',
    color: Colors.ink ?? '#1B1915',
    letterSpacing: -0.2,
  },
  disclaimer: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
    marginTop: 12,
  },
})

const planStyles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
    position: 'relative',
  },
  cardSelected: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: Colors.accent ?? Colors.primary,
  },
  cardPressed: { opacity: 0.85 },
  bestBadge: {
    position: 'absolute',
    top: -10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.accent ?? Colors.primary,
    borderRadius: 6,
  },
  bestBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontFamily: Typography.fontFamily.sansBold,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  period: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  price: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  sub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontFamily: Typography.fontFamily.sans,
    marginTop: 2,
  },
})
