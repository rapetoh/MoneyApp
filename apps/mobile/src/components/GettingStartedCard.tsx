import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Typography, Hairline } from '../theme'
import { t, type Locale } from '@voice-expense/shared'

export type StartItemKey = 'first_expense' | 'budget' | 'income' | 'applepay'

export interface StartItem {
  key: StartItemKey
  done: boolean
  onPress: () => void
}

/**
 * "Getting started" on Today (first-run audit M2, H3): the questions that
 * used to block onboarding (income) and the features the first run never
 * mentioned (Apple Pay capture), offered where the user can see why they
 * matter. Disappears once everything is done, or when hidden.
 */
export function GettingStartedCard({
  items,
  locale,
  onHide,
}: {
  items: StartItem[]
  locale: Locale
  onHide: () => void
}) {
  const done = items.filter((i) => i.done).length
  if (done === items.length) return null
  return (
    <View style={styles.card} testID="getting-started">
      <View style={styles.head}>
        <Text style={styles.title}>{t('start.title', locale)}</Text>
        <Text style={styles.progress}>
          {t('start.progress', locale).replace('{done}', String(done)).replace('{total}', String(items.length))}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onHide} hitSlop={10} accessibilityRole="button">
          <Text style={styles.hide}>{t('start.hide', locale)}</Text>
        </Pressable>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(done / items.length) * 100}%` }]} />
      </View>
      {items.map((item, i) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          disabled={item.done}
          style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityState={{ checked: item.done }}
        >
          <Ionicons
            name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={20}
            color={item.done ? Colors.accent : Colors.ink4}
          />
          <Text style={[styles.label, item.done && styles.labelDone]}>{t(`start.${item.key}`, locale)}</Text>
          {!item.done && <Ionicons name="chevron-forward" size={15} color={Colors.ink4} />}
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { fontSize: 15.5, color: Colors.ink, fontFamily: Typography.fontFamily.sansBold, fontWeight: '700' },
  progress: { fontSize: 12.5, color: Colors.ink4, fontFamily: Typography.fontFamily.sansSemiBold },
  hide: { fontSize: 13, color: Colors.ink3, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  track: { marginTop: 10, height: 4, borderRadius: 2, backgroundColor: Colors.surface2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: Colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { borderTopWidth: Hairline.width, borderTopColor: Hairline.color },
  label: { flex: 1, fontSize: 14.5, color: Colors.ink, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  labelDone: { color: Colors.ink4, textDecorationLine: 'line-through', fontWeight: '500' },
})
