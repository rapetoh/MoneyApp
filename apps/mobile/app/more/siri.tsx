import { View, Text, StyleSheet, ScrollView, Linking, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

/**
 * "Hey Siri, log an expense in Murmur" — what to say, and what comes back
 * (Sep 20, 2026).
 *
 * The App Shortcut (native/ios/SiriLogExpense.swift) is live the moment
 * Murmur is installed, with nothing to set up. What a user cannot guess
 * is the phrase: Apple matches it literally and requires the app's name
 * inside it, so this screen shows the exact exchange rather than
 * describing it. The phrases are localised per language
 * (native/ios/siri-phrases.js), and `siri.phrase` here is the same first
 * phrase iOS listens for.
 */
export default function SiriScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale

  const turns: { label: string; line: string; mine: boolean }[] = [
    { label: t('siri.phrase_label', locale), line: t('siri.phrase', locale), mine: true },
    { label: t('siri.reply_label', locale), line: t('siri.reply', locale), mine: false },
    { label: t('siri.answer_label', locale), line: t('siri.answer', locale), mine: true },
    { label: t('siri.result_label', locale), line: t('siri.result', locale), mine: false },
  ]

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="mic-outline" size={22} color={Colors.accent} />
          </View>
          <Text style={styles.title}>{t('siri.title', locale)}</Text>
          <Text style={styles.body}>{t('siri.body', locale)}</Text>
        </View>

        <View style={styles.card}>
          {turns.map((turn, i) => (
            <View key={turn.label} style={[styles.turn, i === turns.length - 1 && styles.turnLast]}>
              <Text style={styles.turnLabel}>{turn.label}</Text>
              <Text style={[styles.turnLine, turn.mine ? styles.turnMine : styles.turnSiri]}>
                {turn.line}
              </Text>
            </View>
          ))}
        </View>

        {/* The one-time step that tripped the owner up: iOS asks to
            enable the shortcut mid-sentence, which drops the thread and
            sends the next thing you say to plain Siri. */}
        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
          <Text style={styles.noteText}>{t('siri.first_run', locale)}</Text>
        </View>

        <View style={styles.altCard}>
          <Text style={styles.turnLabel}>{t('siri.phrase_alt_label', locale)}</Text>
          <Text style={styles.altText}>{t('siri.phrase_alt', locale)}</Text>
        </View>

        {/* Money coming in has its own door: Murmur is one capture flow
            and Siri should not be expenses only. */}
        <View style={styles.altCard}>
          <Text style={styles.turnLabel}>{t('siri.income_label', locale)}</Text>
          <Text style={[styles.turnLine, styles.turnMine]}>{t('siri.income_phrase', locale)}</Text>
        </View>

        <Pressable
          onPress={() => Linking.openURL('shortcuts://')}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Ionicons name="open-outline" size={16} color={Colors.white} />
          <Text style={styles.ctaText}>{t('siri.open_shortcuts', locale)}</Text>
        </Pressable>

        <Text style={styles.footnote}>{t('siri.footnote', locale)}</Text>
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
    paddingVertical: 4,
  },
  turn: {
    gap: 3,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(40,36,28,0.10)',
  },
  turnLast: { borderBottomWidth: 0 },
  turnLabel: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 10.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  turnLine: { fontSize: 16.5, lineHeight: 23 },
  turnMine: {
    fontFamily: Typography.fontFamily.serif,
    color: Colors.ink ?? Colors.text,
    letterSpacing: -0.2,
  },
  turnSiri: { fontFamily: Typography.fontFamily.sans, color: Colors.accent },
  noteCard: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: Colors.accentSoft,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
  },
  noteText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13.5,
    lineHeight: 19,
    color: Colors.ink ?? Colors.text,
  },
  altCard: {
    gap: 5,
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
  },
  altText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textSecondary,
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
  footnote: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
})
