import { View, Text, StyleSheet } from 'react-native'
import { Colors, Typography } from '../theme'

interface Props {
  spent: number
  limit: number
  /** Outer diameter in px. Defaults to 110 to match S_Budgets in the mockup. */
  size?: number
}

/**
 * Approximates the `BudgetRing` from docs/money-app/project/mobile-screens-5.jsx.
 *
 * The mockup draws a stroked circle with a progress arc via SVG. We don't have
 * `react-native-svg` installed yet, so this renders a simpler filled disc with
 * an `accentSoft` halo + big percent label + "used" caption. The arc-stroke
 * version lands when react-native-svg is added (documented in the Phase D
 * commit message and todo list).
 *
 * Visually the output still reads as a budget usage indicator and lives in the
 * same real estate, so replacing it later is a localized swap.
 */
export function BudgetRing({ spent, limit, size = 110 }: Props) {
  const pct = limit > 0 ? Math.min(spent / limit, 1) : 0
  const pctLabel = Math.round(pct * 100)
  const over = limit > 0 && spent > limit

  const discColor = over
    ? Colors.destructive ?? '#A94646'
    : pct > 0.92
    ? '#C08A3A' // tight-amber — matches the BudgetRow "Tight" chip
    : Colors.accent ?? Colors.primary

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View
        style={[
          styles.outer,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: Colors.surface2 ?? 'rgba(40,36,28,0.06)',
          },
        ]}
      />
      <View
        style={[
          styles.inner,
          {
            width: size - 18,
            height: size - 18,
            borderRadius: (size - 18) / 2,
            backgroundColor: (discColor + '1A') as string, // ~10% alpha halo
          },
        ]}
      />
      <View style={styles.center}>
        <Text style={[styles.pct, { color: Colors.ink ?? Colors.text }]}>{pctLabel}%</Text>
        <Text style={styles.caption}>used</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outer: {
    position: 'absolute',
  },
  inner: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pct: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  caption: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    fontWeight: '600',
    color: Colors.ink3 ?? Colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 2,
  },
})
