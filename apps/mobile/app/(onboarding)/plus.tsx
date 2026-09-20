import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useReduceMotion } from '../../src/hooks/useReduceMotion'
import { haptic } from '../../src/services/haptics'
import { track } from '../../src/services/analytics'
import { Colors, Typography, Motion } from '../../src/theme'
import { t, trialDaysLeft, TRIAL_DAYS, type Locale } from '@voice-expense/shared'

const ITEMS = [
  { key: 'ask', icon: 'sparkles' as const },
  { key: 'recurring', icon: 'repeat' as const },
  { key: 'history', icon: 'stats-chart' as const },
  { key: 'desktop', icon: 'laptop-outline' as const },
]

/**
 * The last onboarding screen: "your fortnight of Plus starts now".
 *
 * A reverse trial only works if the user knows they have the paid product
 * and uses it; if the trial is silent, the downgrade two weeks later is
 * invisible and there is nothing to miss. So this screen names the four
 * things that are now switched on, says plainly that no card is involved
 * and that logging stays free afterwards, and gets out of the way. It
 * replaced the price screen that used to sit here, which asked people to
 * buy what they already had.
 */
export default function PlusWelcomeScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const reduceMotion = useReduceMotion()
  const days = trialDaysLeft(profile) || TRIAL_DAYS

  const rise = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current
  useEffect(() => {
    haptic.success()
    track('onboarding_plus_shown', { days })
    if (reduceMotion) return
    Animated.timing(rise, {
      toValue: 1,
      duration: Motion.enterMs,
      easing: Motion.easeOut,
      useNativeDriver: true,
    }).start()
  }, [rise, reduceMotion, days])

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{
            opacity: rise,
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          }}
        >
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={14} color={Colors.accent} />
            <Text style={styles.badgeText}>{t('paywall.eyebrow', locale)}</Text>
          </View>

          <Text style={styles.headline}>
            {t('onboarding.plus.headline', locale).replace('{days}', String(days))}
          </Text>
          <Text style={styles.lead}>{t('onboarding.plus.lead', locale)}</Text>

          <View style={styles.list}>
            {ITEMS.map((item) => (
              <View key={item.key} style={styles.row}>
                <View style={styles.iconTile}>
                  <Ionicons name={item.icon} size={17} color={Colors.accent} />
                </View>
                <Text style={styles.rowText}>{t(`onboarding.plus.${item.key}`, locale)}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.after}>{t('onboarding.plus.after', locale)}</Text>
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.replace('/(tabs)')}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{t('onboarding.plus.cta', locale)}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.accentSoft,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: Colors.accent,
    fontFamily: Typography.fontFamily.sansBold,
  },
  headline: {
    marginTop: 18,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.6,
    fontWeight: '500',
    color: Colors.ink,
  },
  lead: { marginTop: 10, fontSize: 15.5, lineHeight: 23, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  list: { marginTop: 26, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, fontSize: 15, lineHeight: 21, color: Colors.ink, fontFamily: Typography.fontFamily.sans },
  after: { marginTop: 26, fontSize: 13.5, color: Colors.ink4, fontFamily: Typography.fontFamily.sans },
  footer: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 8 },
  cta: { height: 56, borderRadius: 28, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: Colors.white, fontSize: 17, fontWeight: '600', fontFamily: Typography.fontFamily.sansSemiBold },
})
