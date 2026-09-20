import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useVoiceSession } from '../../src/hooks/useVoiceSession'
import { useReduceMotion } from '../../src/hooks/useReduceMotion'
import { StepDots } from '../../src/components/StepDots'
import { MerchantAvatar } from '../../src/components/MerchantAvatar'
import { haptic } from '../../src/services/haptics'
import { track } from '../../src/services/analytics'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, formatMoney, type Locale } from '@voice-expense/shared'

/**
 * Onboarding step 2: "Try it now" (first-run audit C3, H5, M5).
 *
 * The first spoken expense happens here, inside onboarding, instead of on
 * an empty Today screen the user has to figure out. Tapping the mic is
 * also the moment the Microphone and Speech Recognition alerts appear,
 * so the permission is asked in context, as Apple recommends, with one
 * line of explanation above the button. Typing is always one tap away.
 *
 * The step completes when a new transaction appears (voice or typed;
 * the Quick entry modal is allowed during onboarding by the root gate),
 * then "Filed." lands with a success haptic before moving on.
 */
export default function FirstLogScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { transactions } = useTransactions(user?.id)
  const { openVoice } = useVoiceSession()
  const reduceMotion = useReduceMotion()
  const locale = (profile?.locale ?? 'en') as Locale

  // Transactions that existed before this screen: anything new is the
  // user's first log.
  const baseline = useRef<Set<string> | null>(null)
  if (baseline.current === null) baseline.current = new Set(transactions.map((x) => x.id))
  const filed = useMemo(
    () =>
      transactions.find(
        (x) => !x.is_deleted && x.source !== 'recurring_generated' && !baseline.current!.has(x.id),
      ) ?? null,
    [transactions],
  )

  const tracked = useRef(false)
  const pop = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!filed) {
      pop.setValue(0)
      return
    }
    if (filed.source !== 'voice') haptic.success() // voice saves already buzzed
    if (!tracked.current) {
      tracked.current = true
      track('first_log_saved', { source: filed.source, direction: filed.direction })
    }
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }).start()
  }, [filed, pop])

  // A slow halo around the mic so the one thing to do is obvious.
  const halo = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduceMotion || filed) return
    const loop = Animated.loop(
      Animated.timing(halo, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [halo, reduceMotion, filed])

  const next = () => router.push('/(onboarding)/habit')

  if (filed) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.content}>
          <StepDots step={2} total={4} />
          <View style={styles.filedWrap}>
            <Animated.View style={[styles.check, { transform: [{ scale: pop }] }]}>
              <Ionicons name="checkmark" size={40} color={Colors.white} />
            </Animated.View>
            <Text style={styles.filedTitle}>{t('onboarding.first_log.filed_title', locale)}</Text>
            <View style={styles.filedCard}>
              <MerchantAvatar merchant={filed.merchant} merchantDomain={filed.merchant_domain} size={40} radius={12} />
              <Text style={styles.filedMerchant} numberOfLines={1}>
                {filed.merchant || t(filed.direction === 'credit' ? 'voice.income_label' : 'voice.expense', locale)}
              </Text>
              <Text style={styles.filedAmount}>
                {formatMoney(filed.amount, filed.currency_code, locale)}
              </Text>
            </View>
            <Text style={styles.filedBody}>{t('onboarding.first_log.filed_body', locale)}</Text>
          </View>
        </View>
        <View style={styles.footer}>
          <Pressable
            onPress={next}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{t('common.continue', locale)}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] })
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] })

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StepDots step={2} total={4} />
        <Text style={styles.headline}>{t('onboarding.first_log.headline', locale)}</Text>
        <Text style={styles.lead}>{t('onboarding.first_log.lead', locale)}</Text>

        <View style={styles.example}>
          <Text style={styles.exampleLabel}>{t('onboarding.first_log.example_label', locale)}</Text>
          <Text style={styles.exampleText}>“{t('welcome.demo_transcript', locale)}”</Text>
        </View>

        <View style={styles.micArea}>
          <View style={styles.micStack}>
            {!reduceMotion && (
              <Animated.View
                pointerEvents="none"
                style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
              />
            )}
            <Pressable
              onPress={openVoice}
              style={({ pressed }) => [styles.mic, pressed && { transform: [{ scale: 0.96 }] }]}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.first_log.tap', locale)}
              testID="first-log-mic"
            >
              <Ionicons name="mic" size={38} color={Colors.white} />
            </Pressable>
          </View>
          <Text style={styles.micLabel}>{t('onboarding.first_log.tap', locale)}</Text>
          <View style={styles.noteRow}>
            <Ionicons name="lock-closed" size={12} color={Colors.ink4} />
            <Text style={styles.note}>{t('onboarding.first_log.mic_note', locale)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footerLinks}>
        <Pressable onPress={() => router.push('/transaction/new')} hitSlop={10}>
          <Text style={styles.linkAccent}>{t('voice.type_instead', locale)}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            track('first_log_skipped')
            next()
          }}
          hitSlop={10}
        >
          <Text style={styles.link}>{t('onboarding.first_log.later', locale)}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 16 },
  headline: {
    marginTop: 28,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.6,
    fontWeight: '500',
    color: Colors.ink,
  },
  lead: { marginTop: 10, fontSize: 15, lineHeight: 22, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  example: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  exampleLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink4,
    fontFamily: Typography.fontFamily.sansBold,
  },
  exampleText: {
    marginTop: 6,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 22,
    lineHeight: 28,
    fontStyle: 'italic',
    color: Colors.ink,
  },
  micArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 36, paddingBottom: 8 },
  micStack: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.accent },
  mic: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  micLabel: { marginTop: 10, fontSize: 15, color: Colors.ink2, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  noteRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  note: { fontSize: 12.5, color: Colors.ink4, textAlign: 'center', fontFamily: Typography.fontFamily.sans, flexShrink: 1 },
  footerLinks: {
    paddingHorizontal: 28,
    paddingBottom: 12,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkAccent: { fontSize: 15, color: Colors.accent, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  link: { fontSize: 15, color: Colors.ink3, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  filedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  check: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filedTitle: {
    marginTop: 20,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 40,
    fontWeight: '500',
    color: Colors.ink,
    letterSpacing: -0.6,
  },
  filedCard: {
    marginTop: 22,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  filedMerchant: { flex: 1, fontSize: 16, color: Colors.ink, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  filedAmount: { fontFamily: Typography.fontFamily.serif, fontSize: 22, color: Colors.ink },
  filedBody: { marginTop: 18, fontSize: 15, lineHeight: 22, color: Colors.ink3, textAlign: 'center', fontFamily: Typography.fontFamily.sans },
  footer: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 8 },
  cta: { height: 56, borderRadius: 28, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  ctaPressed: { opacity: 0.85 },
  ctaText: { color: Colors.white, fontSize: 17, fontWeight: '600', fontFamily: Typography.fontFamily.sansSemiBold },
})
