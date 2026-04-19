import { Text, StyleSheet, type TextStyle } from 'react-native'
import { Colors, Typography } from '../theme'

interface Props {
  /** Raw numeric value. Negatives render with a "−" prefix. */
  value: number
  /** Display pixel size for the integer digits. Decimals and currency glyph scale off this. */
  size?: number
  /** If true (default), uses serif display face per DESIGN.md "money is personal, not a spreadsheet". */
  serif?: boolean
  /** Dim the ink color (used when the amount is secondary — breakdown rows, hint copy). */
  muted?: boolean
  /** Font weight for sans variant. Serif rendering always uses 500. */
  sansWeight?: TextStyle['fontWeight']
  /** Currency glyph. Defaults to "$". Use "€", "£", etc. for non-USD. */
  sign?: string
  /** Override default text color (e.g. income green, destructive rose). */
  color?: string
  /** Extra style hook for the outer Text node (margin, alignment). */
  style?: TextStyle | TextStyle[]
}

/**
 * Money — matches the `Money` helper in docs/money-app/project/tokens.jsx.
 *
 * Rendering rules:
 *   - Integer part formatted with locale thousands separator ("1,250").
 *   - Currency glyph rendered at 58% of display size, opacity 0.55, slightly
 *     raised off the baseline so it tucks above the integer.
 *   - Decimal "." + two digits rendered at opacity 0.55 (de-emphasized).
 *   - Tabular figures via `fontVariant: ['tabular-nums']` so columns of
 *     amounts align.
 *   - Negative values render with a Unicode minus "−" (not ASCII hyphen) for
 *     typographic weight.
 *
 * Chooses serif for big hero amounts, sans-display for row-level amounts.
 */
export function Money({
  value,
  size = 28,
  serif = true,
  muted = false,
  sansWeight = '600',
  sign = '$',
  color,
  style,
}: Props) {
  const isNeg = value < 0
  const abs = Math.abs(value)
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const intFmt = parseInt(intPart, 10).toLocaleString('en-US')

  const resolvedColor = color ?? (muted ? Colors.ink3 ?? Colors.textSecondary : Colors.ink ?? Colors.text)
  const family = serif ? Typography.fontFamily.serif : Typography.fontFamily.sansSemiBold
  const weight: TextStyle['fontWeight'] = serif ? '500' : sansWeight
  const letterSpacing = serif ? -0.5 : -0.8

  // Glyph (currency symbol): 58% of size, opacity 0.55, nudged off the
  // baseline. For very large amounts (>40px) we nudge more so the glyph sits
  // above the integer's cap line; for smaller amounts we keep it closer.
  const glyphSize = Math.round(size * 0.58)
  const glyphBaseline: TextStyle['textAlignVertical'] = 'center'
  const glyphLineHeight = size

  return (
    <Text
      style={[
        {
          fontFamily: family,
          fontSize: size,
          fontWeight: weight,
          color: resolvedColor,
          letterSpacing,
          includeFontPadding: false,
          lineHeight: size * 1.05,
        },
        { fontVariant: ['tabular-nums'] },
        style as TextStyle,
      ]}
    >
      {isNeg && '−'}
      <Text
        style={{
          opacity: 0.55,
          fontSize: glyphSize,
          lineHeight: glyphLineHeight,
          textAlignVertical: glyphBaseline,
        }}
      >
        {sign}
      </Text>
      {intFmt}
      <Text style={{ opacity: 0.55 }}>.{decPart}</Text>
    </Text>
  )
}

// Light wrapper for a single-line helper label above a Money row — used by
// Today's "SPENT TODAY" + amount block.
export function MoneyLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>
}

const styles = StyleSheet.create({
  label: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink3 ?? Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
})
