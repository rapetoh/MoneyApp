import { useEffect, useRef } from 'react'
import { Alert, Animated, LayoutAnimation, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { useReduceMotion } from '../hooks/useReduceMotion'
import { Colors, Typography, Hairline, Motion } from '../theme'
import { t, type Locale } from '@voice-expense/shared'

export type StartItemKey = 'first_expense' | 'budget' | 'income' | 'applepay'

export interface StartItem {
  key: StartItemKey
  done: boolean
  onPress: () => void
}

const RING_SIZE = 22
const RING_STROKE = 2.5

/** Progress as a ring: the same figure the header states, in a glance. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = (RING_SIZE - RING_STROKE) / 2
  const c = 2 * Math.PI * r
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} accessibilityElementsHidden>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={r}
        stroke={Colors.surface2}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={r}
        stroke={Colors.accent}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={`${(c * done) / total} ${c}`}
        fill="none"
        // Start at 12 o'clock, like every other ring in the app.
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
    </Svg>
  )
}

/**
 * "Getting started" on Today (first-run audit M2, H3).
 *
 * The questions onboarding no longer asks (income) and the features the
 * first run only mentions once (budget, Apple Pay capture), offered where
 * the user can see why they matter.
 *
 * Two different intents, two different actions (owner review, Sep 19 2026):
 * tapping the header *collapses* the card to a single line with the ring
 * and "2 of 4", which is "later" and costs nothing to undo; the menu holds
 * *Remove*, which is "never", behind a confirmation. The card also retires
 * itself when every item is done, or once the user is past the first-week
 * stage (useFirstRun). Every item lives in its own screen too, so this is
 * a shortcut, never the only path.
 */
export function GettingStartedCard({
  items,
  locale,
  collapsed,
  onToggleCollapsed,
  onRemove,
}: {
  items: StartItem[]
  locale: Locale
  collapsed: boolean
  onToggleCollapsed: () => void
  /** "Never": persisted on the account, so a reinstall cannot bring it back. */
  onRemove: () => void
}) {
  const reduceMotion = useReduceMotion()
  const done = items.filter((i) => i.done).length
  const chevron = useRef(new Animated.Value(collapsed ? 1 : 0)).current

  useEffect(() => {
    if (reduceMotion) {
      chevron.setValue(collapsed ? 1 : 0)
      return
    }
    Animated.timing(chevron, {
      toValue: collapsed ? 1 : 0,
      duration: Motion.exitMs,
      easing: Motion.easeOut,
      useNativeDriver: true,
    }).start()
  }, [collapsed, chevron, reduceMotion])

  if (done === items.length) return null

  const toggle = () => {
    if (!reduceMotion && Platform.OS !== 'web') {
      LayoutAnimation.configureNext({
        duration: 260,
        create: { type: 'easeInEaseOut', property: 'opacity' },
        update: { type: 'easeInEaseOut' },
        delete: { type: 'easeInEaseOut', property: 'opacity' },
      })
    }
    onToggleCollapsed()
  }

  const confirmRemove = () => {
    Alert.alert(t('start.remove_title', locale), t('start.remove_body', locale), [
      { text: t('common.cancel', locale), style: 'cancel' },
      { text: t('start.remove', locale), style: 'destructive', onPress: onRemove },
    ])
  }

  return (
    <View style={[styles.card, collapsed && styles.cardCollapsed]} testID="getting-started">
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.head, pressed && styles.headPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={`${t('start.title', locale)}, ${t('start.progress', locale)
          .replace('{done}', String(done))
          .replace('{total}', String(items.length))}`}
        accessibilityHint={t(collapsed ? 'start.expand' : 'start.collapse', locale)}
        hitSlop={6}
      >
        <ProgressRing done={done} total={items.length} />
        <Text style={styles.title}>{t('start.title', locale)}</Text>
        <Text style={styles.progress}>
          {t('start.progress', locale).replace('{done}', String(done)).replace('{total}', String(items.length))}
        </Text>
        <View style={{ flex: 1 }} />
        <Animated.View
          style={{
            transform: [
              { rotate: chevron.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) },
            ],
          }}
        >
          <Ionicons name="chevron-up" size={16} color={Colors.ink4} />
        </Animated.View>
      </Pressable>

      {/* "Never" lives apart from the tap target that means "later", and
          asks once before it takes effect. */}
      <Pressable
        onPress={confirmRemove}
        style={({ pressed }) => [styles.more, pressed && styles.headPressed]}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('start.more', locale)}
      >
        <Ionicons name="ellipsis-horizontal" size={15} color={Colors.ink4} />
      </Pressable>

      {!collapsed &&
        items.map((item) => (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole="button"
            // Done is not dead: tapping "Set a monthly budget" again opens
            // the editor on the budget you set (owner report, Sep 19 2026).
            accessibilityState={{ checked: item.done }}
          >
            <Ionicons
              name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={item.done ? Colors.accent : Colors.ink4}
            />
            <Text style={[styles.label, item.done && styles.labelDone]}>{t(`start.${item.key}`, locale)}</Text>
            <Ionicons name="chevron-forward" size={15} color={item.done ? Colors.ink4 : Colors.ink3} />
          </Pressable>
        ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // Same geometry as the "Spent today" card it sits above (index.tsx):
  // 22pt margins, 24pt radius, borderless surface. A card that is 6pt off
  // its neighbour is the kind of thing you feel before you see it.
  card: {
    marginHorizontal: 22,
    marginBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    borderRadius: 24,
    backgroundColor: Colors.surface,
  },
  // Collapsed it is one quiet line, with the same breathing room top and bottom.
  cardCollapsed: { paddingBottom: 14 },
  // The chevron sits at the end of the header's own tap target; the menu
  // is a separate, smaller target outside it (top-right of the card).
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, paddingRight: 26 },
  more: { position: 'absolute', top: 12, right: 14, padding: 4 },
  headPressed: { opacity: 0.6 },
  title: { fontSize: 15.5, color: Colors.ink, fontFamily: Typography.fontFamily.sansBold, fontWeight: '700' },
  progress: { fontSize: 13, color: Colors.ink4, fontFamily: Typography.fontFamily.sansSemiBold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: Hairline.width,
    borderTopColor: Hairline.color,
  },
  rowPressed: { opacity: 0.6 },
  label: { flex: 1, fontSize: 14.5, color: Colors.ink, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  labelDone: { color: Colors.ink4, textDecorationLine: 'line-through', fontWeight: '500' },
})
