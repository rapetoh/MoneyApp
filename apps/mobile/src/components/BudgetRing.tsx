import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Colors, Typography } from '../theme'

interface Props {
  spent: number
  limit: number
  /** Outer diameter in px. Defaults to 110 to match S_Budgets in the mockup. */
  size?: number
}

/**
 * Matches `BudgetRing` in docs/money-app/project/mobile-screens-5.jsx: a stroked
 * track circle with a progress arc drawn on top via stroke-dasharray. The arc
 * color flips from sage → tight-amber → destructive as usage climbs.
 *
 * Reads as "X%" + "used" in the center. Over-limit still shows 100% on the
 * arc (dasharray clamped at circumference) but switches the color to rose so
 * the semantic is clear at a glance.
 */
export function BudgetRing({ spent, limit, size = 110 }: Props) {
  const pct = limit > 0 ? Math.min(spent / limit, 1) : 0
  const pctLabel = Math.round(pct * 100)
  const over = limit > 0 && spent > limit

  const arcColor = over
    ? Colors.destructive ?? '#A94646'
    : pct > 0.92
    ? '#C08A3A' // tight-amber — matches the BudgetRow "Tight" chip
    : Colors.accent ?? Colors.primary

  // Stroke math — the arc is drawn on a centered circle whose radius accounts
  // for the stroke width so the arc sits flush inside the box.
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const arcLength = circumference * pct

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Rotate -90° so the arc starts at 12 o'clock instead of 3 o'clock. */}
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={Colors.surface2 ?? 'rgba(40,36,28,0.08)'}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc — dasharray clips the stroke to pct × circumference */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={arcColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          fill="none"
        />
      </Svg>
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
  center: {
    ...StyleSheet.absoluteFillObject,
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
