import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Typography, Hairline } from '../theme'
import { t, type Locale } from '@voice-expense/shared'

interface Props {
  locale: Locale
  /** Called when the user taps "Skip" — unmounts the coach surface. */
  onSkip: () => void
  /** Called when the user taps "Or type instead" — navigates to manual entry. */
  onTypeInstead: () => void
}

// Three example phrasings. Same set across locales (the translations live in
// the ask.suggestion_* style keys below: home.day_one_example_{1,2,3}) so
// first-log guidance reads naturally in each language.
const EXAMPLE_KEYS = [
  'home.day_one_example_1',
  'home.day_one_example_2',
  'home.day_one_example_3',
]

/**
 * Day-1 guided first log — matches S_DayOne in
 * docs/money-app/project/mobile-screens-5.jsx.
 *
 * Rendered inside the Today tab whenever the user has no transactions yet
 * (and hasn't tapped Skip this session). The mic FAB glow + "Tap & hold to
 * speak" callout from the mockup are intentionally not drawn — their
 * positioning depends on the tab-bar layout and would be brittle across
 * device sizes. Core guidance (headline + example phrasings + "type
 * instead" escape hatch) is preserved.
 */
export function DayOneFirstLog({ locale, onSkip, onTypeInstead }: Props) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Top row — progress eyebrow + Skip */}
      <View style={styles.topRow}>
        <Text style={styles.progress}>{t('home.day_one_progress', locale)}</Text>
        <Pressable
          onPress={onSkip}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={styles.skipText}>{t('common.skip', locale)}</Text>
        </Pressable>
      </View>

      {/* Hero copy */}
      <View style={styles.hero}>
        <Text style={styles.headline}>{t('home.day_one_headline', locale)}</Text>
        <Text style={styles.body}>{t('home.day_one_body', locale)}</Text>
      </View>

      {/* Example cards */}
      <View style={styles.examples}>
        {EXAMPLE_KEYS.map((key) => (
          <View key={key} style={styles.exampleRow}>
            <View style={styles.micTile}>
              <Ionicons
                name="mic"
                size={15}
                color={Colors.accent ?? Colors.primary}
              />
            </View>
            <Text style={styles.exampleText} numberOfLines={2}>
              {t(key, locale)}
            </Text>
          </View>
        ))}
      </View>

      {/* Bottom escape hatch — type instead of speaking */}
      <Pressable
        onPress={onTypeInstead}
        hitSlop={8}
        style={({ pressed }) => [styles.typeInsteadWrap, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.typeInsteadPrefix}>
          {t('home.day_one_or', locale)}{' '}
          <Text style={styles.typeInsteadAccent}>
            {t('home.day_one_type_instead', locale)}
          </Text>
        </Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: 120 },

  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progress: {
    color: Colors.ink4 ?? Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  skipText: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },

  hero: {
    paddingHorizontal: 28,
    paddingTop: 36,
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 34,
    fontWeight: '500',
    letterSpacing: -0.6,
    lineHeight: 40,
    color: Colors.ink ?? Colors.text,
  },
  body: {
    fontSize: 14.5,
    color: Colors.ink3 ?? Colors.textSecondary,
    lineHeight: 22,
    marginTop: 12,
    fontFamily: Typography.fontFamily.sans,
  },

  examples: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 10,
  },
  exampleRow: {
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
  micTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleText: {
    flex: 1,
    fontSize: 15,
    fontStyle: 'italic',
    color: Colors.ink ?? Colors.text,
    letterSpacing: -0.2,
    fontFamily: Typography.fontFamily.sans,
  },

  typeInsteadWrap: {
    paddingTop: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  typeInsteadPrefix: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
  },
  typeInsteadAccent: {
    color: Colors.accent ?? Colors.primary,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },
})
