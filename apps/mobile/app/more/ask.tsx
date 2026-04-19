import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

// Four starter prompts shown as tappable cards. The emoji set is intentionally
// the same across locales — they read as universal glyphs — while the text is
// localized. Each key maps to a sentence in locales/*.json.
const SUGGESTIONS: { icon: string; key: string }[] = [
  { icon: '🎮', key: 'ask.suggestion_afford' },
  { icon: '☕', key: 'ask.suggestion_coffee' },
  { icon: '📉', key: 'ask.suggestion_unusual' },
  { icon: '🎯', key: 'ask.suggestion_goal' },
]

/**
 * Ask Murmur — entry state.
 *
 * Matches S_AskEntry in docs/money-app/project/mobile-screens-5.jsx. The
 * grounded-reasoner backend is Phase E; this screen is the plus-gated entry
 * UI. Tapping any suggestion, the input bar, or the mic button routes the
 * user to the paywall — Ask is part of Murmur Plus.
 */
export default function AskMurmurScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const router = useRouter()

  function gotoPaywall() {
    router.push('/more/paywall')
  }

  return (
    <>
      {/* Native Stack header is hidden — we render our own close pill + beta
          chip, per the mockup. */}
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Top row — close pill + Beta chip */}
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.closePill, pressed && styles.pillPressed]}
              hitSlop={8}
              accessibilityLabel={t('common.cancel', locale)}
            >
              <Ionicons name="close" size={16} color={Colors.ink2 ?? Colors.textSecondary} />
            </Pressable>
            <View style={styles.betaChip}>
              <Ionicons name="sparkles" size={11} color={Colors.accent ?? Colors.primary} />
              <Text style={styles.betaText}>{t('ask.beta', locale)}</Text>
            </View>
          </View>

          {/* Hero — sparkle tile + serif title + lead copy */}
          <View style={styles.hero}>
            <View style={styles.sparkleTile}>
              <Ionicons name="sparkles" size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>{t('ask.title', locale)}</Text>
            <Text style={styles.lead}>{t('ask.lead', locale)}</Text>
          </View>

          {/* Suggestions */}
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s, i) => (
              <Pressable
                key={i}
                onPress={gotoPaywall}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  pressed && styles.suggestionRowPressed,
                ]}
              >
                <View style={styles.emojiTile}>
                  <Text style={styles.emoji}>{s.icon}</Text>
                </View>
                <Text style={styles.suggestionText} numberOfLines={2}>
                  {t(s.key, locale)}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={Colors.ink4 ?? Colors.textMuted}
                />
              </Pressable>
            ))}
          </View>

          {/* Spacer — keeps the input bar anchored near the bottom on tall
              phones but still scrolls on smaller ones. */}
          <View style={styles.flex} />

          {/* Input bar + privacy footnote */}
          <View style={styles.inputWrap}>
            <Pressable onPress={gotoPaywall} style={styles.inputBar}>
              <Text style={styles.inputPlaceholder} numberOfLines={1}>
                {t('ask.input_placeholder', locale)}
              </Text>
              <Pressable
                onPress={gotoPaywall}
                style={({ pressed }) => [styles.micButton, pressed && styles.micButtonPressed]}
                hitSlop={6}
                accessibilityLabel={t('ask.mic_label', locale)}
              >
                <Ionicons name="mic" size={20} color="#FFFFFF" />
              </Pressable>
            </Pressable>
            <View style={styles.footerRow}>
              <Ionicons
                name="lock-closed"
                size={11}
                color={Colors.ink4 ?? Colors.textMuted}
              />
              <Text style={styles.footerText}>{t('ask.privacy_note', locale)}</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — trace S_AskEntry in docs/money-app/project/mobile-screens-5.jsx
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, paddingBottom: 24 },
  flex: { flex: 1 },

  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closePill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPressed: { opacity: 0.6 },
  betaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    borderRadius: 999,
  },
  betaText: {
    color: Colors.accent ?? Colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },

  hero: { paddingHorizontal: 28, paddingTop: 40 },
  sparkleTile: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.ink ?? '#1B1915',
    alignItems: 'center',
    justifyContent: 'center',
    // Soft drop shadow — "boxShadow: 0 6px 18px rgba(0,0,0,0.18)" from the mockup.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  title: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 36,
    fontWeight: '500',
    letterSpacing: -0.8,
    lineHeight: 42,
    color: Colors.ink ?? Colors.text,
    marginTop: 22,
  },
  lead: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    fontFamily: Typography.fontFamily.sans,
  },

  suggestions: {
    paddingHorizontal: 20,
    paddingTop: 28,
    flexDirection: 'column',
    gap: 10,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 16,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  suggestionRowPressed: { opacity: 0.7 },
  emojiTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface2 ?? Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 18 },
  suggestionText: {
    flex: 1,
    fontSize: 14.5,
    color: Colors.ink ?? Colors.text,
    fontWeight: '500',
    letterSpacing: -0.2,
    fontFamily: Typography.fontFamily.sans,
  },

  inputWrap: { paddingHorizontal: 16, paddingTop: 8 },
  inputBar: {
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 26,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  inputPlaceholder: {
    flex: 1,
    fontSize: 15,
    color: Colors.ink4 ?? Colors.textMuted,
    fontFamily: Typography.fontFamily.sans,
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent ?? Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonPressed: { opacity: 0.8 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  footerText: {
    fontSize: 11.5,
    color: Colors.ink4 ?? Colors.textMuted,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
  },
})
