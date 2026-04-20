import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

type PermStatus = 'idle' | 'granted' | 'denied'

/**
 * Step 2 — Permissions. Matches S_Permissions in mobile-screens-4.jsx.
 * Only asks for the microphone here; Shortcuts/Apple-Pay and Face ID from
 * the mockup are optional follow-ups that don't need to block onboarding.
 */
export default function PermissionsScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const router = useRouter()
  const [micStatus, setMicStatus] = useState<PermStatus>('idle')

  // Check if we already have mic permission on mount — if the user comes
  // back to this screen after granting, we skip the ask and just reflect
  // the current state.
  useEffect(() => {
    let mounted = true
    ExpoSpeechRecognitionModule.getPermissionsAsync()
      .then((res) => {
        if (mounted && res.granted) setMicStatus('granted')
      })
      .catch(() => {
        /* permission API unavailable (e.g. web / simulator edge case) */
      })
    return () => {
      mounted = false
    }
  }, [])

  async function handleAllowMic() {
    try {
      const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      setMicStatus(res.granted ? 'granted' : 'denied')
    } catch {
      setMicStatus('denied')
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.content}>
        <Text style={styles.progress}>{t('onboarding.permissions.progress', locale)}</Text>
        <Text style={styles.headline}>{t('onboarding.permissions.headline', locale)}</Text>
        <Text style={styles.lead}>{t('onboarding.permissions.lead', locale)}</Text>

        <View style={styles.cards}>
          {/* Microphone — required for voice capture. */}
          <View style={styles.card}>
            <View style={[styles.iconTile, micStatus === 'granted' && styles.iconTileGranted]}>
              <Ionicons
                name="mic"
                size={18}
                color={
                  micStatus === 'granted'
                    ? Colors.accent ?? Colors.primary
                    : Colors.ink3 ?? Colors.textSecondary
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {t('onboarding.permissions.mic_title', locale)}
              </Text>
              <Text style={styles.cardSub}>
                {t('onboarding.permissions.mic_sub', locale)}
              </Text>
            </View>
            {micStatus === 'granted' ? (
              <View style={styles.checkPill}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
            ) : (
              <Pressable
                onPress={handleAllowMic}
                style={({ pressed }) => [styles.allowBtn, pressed && styles.allowBtnPressed]}
              >
                <Text style={styles.allowBtnText}>
                  {micStatus === 'denied'
                    ? t('onboarding.permissions.try_again', locale)
                    : t('onboarding.permissions.allow', locale)}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={{ flex: 1 }} />

        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={() => router.push('/(onboarding)/income')}
        >
          <Text style={styles.ctaText}>{t('common.continue', locale)}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 40, paddingBottom: 40 },

  progress: {
    color: Colors.ink4 ?? Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 34,
    fontWeight: '500',
    letterSpacing: -0.6,
    lineHeight: 40,
    color: Colors.ink ?? Colors.text,
    marginTop: 10,
  },
  lead: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    fontFamily: Typography.fontFamily.sans,
  },

  cards: { marginTop: 36, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: 16,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.surface2 ?? '#F5F2EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileGranted: { backgroundColor: Colors.accentSoft ?? Colors.primaryLight },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
    letterSpacing: -0.2,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  cardSub: {
    fontSize: 12.5,
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.sans,
  },
  checkPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent ?? Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allowBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.ink ?? '#1B1915',
  },
  allowBtnPressed: { opacity: 0.85 },
  allowBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },

  cta: {
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.ink ?? '#1B1915',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
})
