import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, Animated, Easing } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import {
  Colors,
  Typography,
  Hairline,
  useTabBarClearance,
  TAB_BAR_HEIGHT,
  TAB_BAR_BOTTOM_OFFSET,
  TAB_BAR_FAB_OVERHANG,
} from '../theme'
import { useReduceMotion } from '../hooks/useReduceMotion'
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
 * Day-1 guided first log, S_DayOne in docs/money-app/project/mobile-screens-5.jsx.
 *
 * Shown on Today until the first expense is logged (useFirstRun). The
 * design's two load-bearing pieces are drawn (first-run audit C3): a
 * "Tap to speak" callout pointing down at the mic button, positioned from
 * the tab bar's own constants so it tracks the button on every device,
 * and the glow ring on the button itself (tabs layout, RecordFab).
 */
export function DayOneFirstLog({ locale, onSkip, onTypeInstead }: Props) {
  // Rendered inside the Today tab, underneath the floating tab bar —
  // `useTabBarClearance()` replaces the hand-picked `paddingBottom: 120`
  // literal (audit 01-F13, fix-plan 1.8/2.14).
  const tabBarClearance = useTabBarClearance()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReduceMotion()
  const bob = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduceMotion) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [bob, reduceMotion])
  // Just above the mic button: bar offset + bar + the button's overhang.
  const pointerBottom = insets.bottom + TAB_BAR_BOTTOM_OFFSET + TAB_BAR_HEIGHT + TAB_BAR_FAB_OVERHANG + 8

  return (
    <View style={styles.root}>
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
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
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pointer,
        { bottom: pointerBottom, transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }) }] },
      ]}
    >
      <View style={styles.pointerPill}>
        <Text style={styles.pointerText}>{t('onboarding.first_log.tap', locale)}</Text>
      </View>
      <Ionicons name="caret-down" size={16} color={Colors.ink} style={{ marginTop: -4 }} />
    </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pointer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pointerPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.ink,
  },
  pointerText: { color: Colors.white, fontSize: 13.5, fontWeight: '600', fontFamily: Typography.fontFamily.sansSemiBold },
  // `paddingBottom` set per-instance above from `useTabBarClearance()`.
  content: {},

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
