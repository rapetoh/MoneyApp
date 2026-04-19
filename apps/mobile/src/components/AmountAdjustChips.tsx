import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Colors, Typography, Spacing, Radius } from '../theme'

interface Props {
  /** Current amount as a numeric string (e.g. "12.40") */
  value: string
  onChange: (next: string) => void
  /** Chip deltas — negative decrements, positive increments. Defaults to −$1/+$1/+$5/+$10 per DESIGN.md §5 Confirm. */
  deltas?: number[]
}

/**
 * Quick-adjust chips shown under the Voice/Manual confirm amount field.
 * Wrong amount is the #1 voice-parse error; a one-tap fix beats forcing the
 * keyboard open. See docs/DESIGN.md §5 "Confirm".
 */
export function AmountAdjustChips({ value, onChange, deltas = [-1, 1, 5, 10] }: Props) {
  function applyDelta(delta: number) {
    const current = parseFloat(value.replace(',', '.'))
    const safe = isNaN(current) ? 0 : current
    const next = Math.max(0, safe + delta)
    // Round to 2 decimals and drop trailing zeros so "12" stays "12", "12.50" stays "12.50".
    const rounded = Math.round(next * 100) / 100
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
    onChange(text)
  }

  return (
    <View style={styles.row}>
      {deltas.map((d) => {
        const label = d < 0 ? `−$${Math.abs(d)}` : `+$${d}`
        return (
          <Pressable
            key={d}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            onPress={() => applyDelta(d)}
            hitSlop={6}
          >
            <Text style={styles.chipLabel}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingTop: 4,
    paddingBottom: Spacing.xs,
  },
  chip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.surface2 ?? Colors.background,
    borderWidth: 1,
    borderColor: Colors.line ?? Colors.border,
  },
  chipPressed: {
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    borderColor: Colors.primary,
  },
  chipLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.ink2 ?? Colors.text,
  },
})
