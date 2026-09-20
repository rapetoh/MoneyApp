import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { Colors, Typography, Hairline } from '../theme'
import { t, isTrialActive, trialDaysLeft, type Locale, type Profile } from '@voice-expense/shared'

/** Dismissal of the after-the-fact notice; the countdown is not dismissible
 *  (it is timely and disappears on its own). */
export const KEY_TRIAL_ENDED_SEEN = 'trial_ended_seen'

/** Only the last stretch of the week gets a banner: earlier is nagging. */
const NUDGE_FROM_DAYS_LEFT = 3
/** How long after the trial we explain what changed. */
const ENDED_NOTICE_DAYS = 5

/**
 * The two moments of the reverse trial on Today (pricing model, Sep 20 2026).
 *
 * Every account starts with a week of full Plus and no card, so the only
 * honest things to say are "this ends soon, here is what it holds" near
 * the end, and "here is what you keep" just after. No countdown theatre,
 * no red, no blocking.
 */
export function TrialBanner({ profile, locale }: { profile: Profile | null; locale: Locale }) {
  const router = useRouter()
  const [endedSeen, setEndedSeen] = useState<boolean | null>(null)

  useEffect(() => {
    SecureStore.getItemAsync(KEY_TRIAL_ENDED_SEEN)
      .then((v) => setEndedSeen(v === '1'))
      .catch(() => setEndedSeen(true))
  }, [])

  if (!profile || profile.plus_status === 'active' || !profile.trial_ends_at) return null

  const daysLeft = trialDaysLeft(profile)
  const running = isTrialActive(profile)

  if (running) {
    if (daysLeft > NUDGE_FROM_DAYS_LEFT) return null
    const title =
      daysLeft <= 1
        ? t(daysLeft === 1 ? 'trial.ending_tomorrow' : 'trial.ending_today', locale)
        : t('trial.ending_days', locale).replace('{days}', String(daysLeft))
    return (
      <Banner
        icon="sparkles"
        title={title}
        body={t('trial.ending_body', locale)}
        cta={t('trial.keep', locale)}
        onPress={() => router.push({ pathname: '/more/paywall', params: { origin: 'trial_ending' } })}
      />
    )
  }

  // Ended: explain once, within a few days, then never again.
  const endedMsAgo = Date.now() - Date.parse(profile.trial_ends_at)
  if (endedSeen !== false || endedMsAgo > ENDED_NOTICE_DAYS * 86_400_000) return null

  return (
    <Banner
      icon="checkmark-circle"
      title={t('trial.ended_title', locale)}
      body={t('trial.ended_body', locale)}
      cta={t('trial.keep', locale)}
      onPress={() => router.push({ pathname: '/more/paywall', params: { origin: 'trial_ended' } })}
      onDismiss={() => {
        setEndedSeen(true)
        SecureStore.setItemAsync(KEY_TRIAL_ENDED_SEEN, '1').catch(() => {})
      }}
    />
  )
}

function Banner({
  icon,
  title,
  body,
  cta,
  onPress,
  onDismiss,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string
  body: string
  cta: string
  onPress: () => void
  onDismiss?: () => void
}) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconTile}>
          <Ionicons name={icon} size={16} color={Colors.accent} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {onDismiss && (
          <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button">
            <Ionicons name="close" size={16} color={Colors.ink4} />
          </Pressable>
        )}
      </View>
      <Text style={styles.body}>{body}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{cta}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 22,
    marginBottom: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconTile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 15, color: Colors.ink, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  body: { marginTop: 8, fontSize: 13, lineHeight: 19, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  cta: {
    marginTop: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: Colors.white, fontSize: 15, fontWeight: '600', fontFamily: Typography.fontFamily.sansSemiBold },
})
