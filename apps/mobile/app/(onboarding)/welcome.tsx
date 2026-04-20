import { View, Text, StyleSheet, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

// The three value props shown under the serif headline. Icons map to
// Ionicons names — mic, lock, analytics — matching the mockup's
// Icon.mic / Icon.lock / Icon.chart glyphs.
const PROPS: { icon: React.ComponentProps<typeof Ionicons>['name']; titleKey: string; subKey: string }[] = [
  { icon: 'mic', titleKey: 'onboarding.welcome.prop_voice_title', subKey: 'onboarding.welcome.prop_voice_sub' },
  { icon: 'lock-closed', titleKey: 'onboarding.welcome.prop_nobank_title', subKey: 'onboarding.welcome.prop_nobank_sub' },
  { icon: 'analytics', titleKey: 'onboarding.welcome.prop_desktop_title', subKey: 'onboarding.welcome.prop_desktop_sub' },
]

/**
 * Step 1 — Welcome. Matches S_Onboard in mobile-screens-2.jsx:
 * sage logo tile + serif "Speak it. Spend clearly." + 3 value props +
 * dark ink "Get started" CTA.
 */
export default function WelcomeScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const router = useRouter()

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.content}>
        {/* Sage logo mark — matches the mockup's 56×56 accent tile with "M" */}
        <View style={styles.logoTile}>
          <Text style={styles.logoGlyph}>M</Text>
        </View>

        <Text style={styles.headline}>{t('onboarding.welcome.headline', locale)}</Text>
        <Text style={styles.lead}>{t('onboarding.welcome.lead', locale)}</Text>

        {/* Three value props */}
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
              <View style={{ flex: 1 }}>
                <Text style={styles.propTitle}>{t(p.titleKey, locale)}</Text>
                <Text style={styles.propSub}>{t(p.subKey, locale)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ flex: 1 }} />

        {/* Dark ink CTA */}
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={() => router.push('/(onboarding)/permissions')}
        >
          <Text style={styles.ctaText}>{t('onboarding.welcome.cta', locale)}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 40,
  },

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
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1,
    color: Colors.ink ?? Colors.text,
    fontWeight: '500',
    marginTop: 32,
  },
  lead: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 17,
    lineHeight: 25,
    marginTop: 16,
    fontFamily: Typography.fontFamily.sans,
  },

  props: {
    marginTop: 40,
    gap: 18,
  },
  propRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  propIconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
    letterSpacing: -0.2,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  propSub: {
    fontSize: 14,
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.sans,
  },

  cta: {
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.ink ?? '#1B1915',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
})
