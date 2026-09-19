import { useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { KEY_CHECKLIST, KEY_ONBOARDING_FOLLOWUP, type OnboardingFollowup } from '../../src/hooks/useFirstRun'
import { StepDots } from '../../src/components/StepDots'
import { CHECKIN_HOURS, DEFAULT_CHECKIN, enableCheckIn, formatCheckInHour, setCheckIn } from '../../src/services/reminders'
import { track } from '../../src/services/analytics'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

/**
 * Onboarding step 3: "Never miss one" (first-run audit C4, M4, M6, H3).
 *
 * Without a bank connection the product lives on the logging habit, so the
 * habit tools are set up while motivation is highest:
 *   - Evening check-in, on by default with a chosen hour. This screen is
 *     the explanation; its single "Continue" button is what opens the iOS
 *     notification alert (Apple's guidance for pre-permission screens).
 *   - Apple Pay auto-capture (iPhone only), the App Store page's second
 *     promise: opt in to open the guided setup right after onboarding.
 *
 * Finishing writes onboarding_completed_at and hands a one-shot follow-up
 * to the tabs layout: the Apple Pay setup if chosen, otherwise the Plus
 * offer (audit H2).
 */
export default function HabitScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { profile, updateProfile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale

  const [checkIn, setCheckInOn] = useState(true)
  const [hour, setHour] = useState<number>(DEFAULT_CHECKIN.hour)
  const [applePayNext, setApplePayNext] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function finish() {
    setSaving(true)
    setError(null)
    let notifications: 'granted' | 'denied' | 'off' = 'off'
    try {
      if (checkIn) notifications = await enableCheckIn(locale, hour)
      else await setCheckIn({ enabled: false, hour, minute: 0 })
    } catch {
      // A reminder problem must never trap someone in onboarding.
    }
    const ok = await updateProfile({ onboarding_completed_at: new Date().toISOString() })
    if (!ok) {
      setSaving(false)
      setError(t('common.save_failed', locale))
      return
    }
    track('habit_done', { checkin: checkIn, hour, notifications, applepay_next: applePayNext })
    const followup: OnboardingFollowup = applePayNext ? 'applepay' : 'plus'
    await SecureStore.setItemAsync(KEY_ONBOARDING_FOLLOWUP, followup).catch(() => {})
    await SecureStore.setItemAsync(KEY_CHECKLIST, '1').catch(() => {})
    setSaving(false)
    router.replace('/(tabs)')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StepDots step={2} total={3} />
        <Text style={styles.headline}>{t('onboarding.habit.headline', locale)}</Text>
        <Text style={styles.lead}>{t('onboarding.habit.lead', locale)}</Text>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.icon}>
              <Ionicons name="moon-outline" size={18} color={Colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t('onboarding.habit.checkin_title', locale)}</Text>
              <Text style={styles.cardBody}>{t('onboarding.habit.checkin_body', locale)}</Text>
            </View>
            <Switch
              value={checkIn}
              onValueChange={setCheckInOn}
              trackColor={{ true: Colors.accent, false: undefined }}
              accessibilityLabel={t('onboarding.habit.checkin_title', locale)}
            />
          </View>
          {checkIn && (
            <View style={styles.hours}>
              {CHECKIN_HOURS.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => setHour(h)}
                  style={[styles.hour, h === hour && styles.hourOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: h === hour }}
                >
                  <Text style={[styles.hourText, h === hour && styles.hourTextOn]}>{formatCheckInHour(h, locale)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {Platform.OS === 'ios' && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.icon}>
                <Ionicons name="wallet-outline" size={18} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t('onboarding.habit.applepay_title', locale)}</Text>
                <Text style={styles.cardBody}>{t('onboarding.habit.applepay_body', locale)}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setApplePayNext((v) => !v)}
              style={styles.toggleRow}
              accessibilityRole="switch"
              accessibilityState={{ checked: applePayNext }}
            >
              <Ionicons
                name={applePayNext ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={applePayNext ? Colors.accent : Colors.ink4}
              />
              <Text style={styles.toggleText}>{t('onboarding.habit.applepay_toggle', locale)}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.error}>{error}</Text>}
        {checkIn && <Text style={styles.note}>{t('onboarding.habit.notif_note', locale)}</Text>}
        <Pressable
          onPress={finish}
          disabled={saving}
          style={({ pressed }) => [styles.cta, (pressed || saving) && styles.ctaPressed]}
          accessibilityRole="button"
        >
          {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.ctaText}>{t('common.continue', locale)}</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 24 },
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
  card: {
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15.5, color: Colors.ink, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  cardBody: { marginTop: 3, fontSize: 13, lineHeight: 19, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  hours: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hour: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourOn: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  hourText: { fontSize: 13.5, color: Colors.ink2, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  hourTextOn: { color: Colors.white },
  toggleRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  toggleText: { fontSize: 14.5, color: Colors.ink, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  footer: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 8 },
  note: { fontSize: 12.5, color: Colors.ink4, textAlign: 'center', marginBottom: 10, fontFamily: Typography.fontFamily.sans },
  error: {
    color: Colors.destructive,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  cta: { height: 56, borderRadius: 28, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  ctaPressed: { opacity: 0.85 },
  ctaText: { color: Colors.white, fontSize: 17, fontWeight: '600', fontFamily: Typography.fontFamily.sansSemiBold },
})
