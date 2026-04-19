import { View, Text, StyleSheet } from 'react-native'
import { Colors, Typography } from '../theme'

interface Props {
  /** 7 spend values, Monday–Sunday. Bars scale proportionally; today's bar is highlighted. */
  values: number[]
  /** Index (0=Mon, 6=Sun) to highlight as "today" with the sage accent. */
  todayIndex: number
  /** Localized single-letter day headers — defaults to English M T W T F S S. */
  dayLabels?: [string, string, string, string, string, string, string]
  /** Total width of the chart in px. Each bar is 8px, gap 6px — 7 bars ≈ 98px. */
  width?: number
}

/**
 * 7-bar weekly spend chart reproduced from the `MiniBars` helper in
 * docs/money-app/project/mobile-screens-1.jsx. Shown in the Today tab's
 * "Spent today" card. Heights are proportional; "today" renders in sage,
 * the rest in `lineHard` neutral. No axes, no gridlines, no legend — it's
 * a subtle embellishment, not a real chart.
 */
export function MiniBars({
  values,
  todayIndex,
  dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  width,
}: Props) {
  const max = Math.max(...values, 1)
  // Bars render between 4px (the bare minimum visible nub) and ~44px so the
  // tallest bar fills the card's right-hand column.
  const maxBarHeight = 44

  return (
    <View style={[styles.row, width != null && { width }]}>
      {values.map((v, i) => {
        const h = 4 + Math.round((v / max) * (maxBarHeight - 4))
        const isToday = i === todayIndex
        return (
          <View key={i} style={styles.col}>
            <View
              style={[
                styles.bar,
                { height: h, backgroundColor: isToday ? Colors.accent ?? Colors.primary : 'rgba(40,36,28,0.14)' },
              ]}
            />
            <Text style={styles.label}>{dayLabels[i]}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  col: {
    alignItems: 'center',
    gap: 4,
  },
  bar: {
    width: 8,
    borderRadius: 3,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.ink4 ?? Colors.textMuted,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
})
