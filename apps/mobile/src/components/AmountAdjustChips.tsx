import { View, Text, Pressable, StyleSheet } from 'react-native'
import { formatMoneyParts, amountAdjustDeltasFor } from '@voice-expense/shared'
import { Colors, Typography, Spacing, Radius } from '../theme'

interface Props {
  /** Current amount as a numeric string (e.g. "12.40") */
  value: string
  onChange: (next: string) => void
  /** ISO 4217 currency code the amount is denominated in. Required:
   *  fix-plan 2.6 (audit 01-F19) — a bare `$1`/`$5`/`$10` chip label on
   *  a EUR entry sat beside a correctly-symbolled `€` amount field in
   *  the same card. Also drives the default `deltas` magnitude table
   *  (a ±1 JPY chip corrects nothing). */
  currencyCode: string
  /** BCP 47 locale for the chip labels' digit grouping. */
  locale: string
  /** Chip deltas — negative decrements, positive increments. Defaults to
   *  a per-currency magnitude table (`amountAdjustDeltasFor`) rather
   *  than a flat `[-1, 1, 5, 10]` — see that function's doc comment. */
  deltas?: number[]
}

/** `"−$1"` / `"+¥100"` / `"+₦1,000"` — sign + this currency/locale's
 *  symbol + the delta's whole-number magnitude, in the symbol's own
 *  before/after position. Deltas are always whole numbers by
 *  construction (`amountAdjustDeltasFor`), so the decimal/fraction
 *  `formatMoneyParts` would otherwise force onto every chip is dropped
 *  here — a delta chip is not a stored amount, it doesn't need cents. */
function deltaLabel(delta: number, currencyCode: string, locale: string): string {
  const { symbol, symbolFirst, integer } = formatMoneyParts(Math.abs(delta), currencyCode, locale)
  const sign = delta < 0 ? '−' : '+'
  return symbolFirst ? `${sign}${symbol}${integer}` : `${sign}${integer} ${symbol}`
}

/**
 * Quick-adjust chips shown under the Voice/Manual confirm amount field.
 * Wrong amount is the #1 voice-parse error; a one-tap fix beats forcing the
 * keyboard open. See docs/DESIGN.md §5 "Confirm".
 */
export function AmountAdjustChips({ value, onChange, currencyCode, locale, deltas }: Props) {
  const resolvedDeltas = deltas ?? amountAdjustDeltasFor(currencyCode)

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
      {resolvedDeltas.map((d) => {
        const label = deltaLabel(d, currencyCode, locale)
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
