import { Text, StyleSheet, type TextStyle } from 'react-native'
import { formatMoneyParts } from '@voice-expense/shared'
import { Colors, Typography } from '../theme'

interface Props {
  /** Raw numeric value. Negatives render with a "−" prefix. */
  value: number
  /** ISO 4217 currency code the amount is denominated in — e.g. the
   *  row's own `transaction.currency_code`, or `profile.currency_code`
   *  for an aggregate. Required: fix-plan 2.6 (audit 01-F6/05-F4/07-F3/
   *  08-F4). The old `sign?: string` prop defaulted to `'$'`, and eleven
   *  of thirteen call sites omitted it — every aggregate on the app
   *  rendered a EUR/GBP/XAF/NGN profile's money in dollars while the
   *  transaction rows directly beneath rendered correctly. There is no
   *  safe default for this parameter; making it required makes the
   *  omission a compile error instead of a silent wrong currency. */
  currencyCode: string
  /** BCP 47 locale for digit grouping and the decimal separator — e.g.
   *  `profile.locale`. Required for the same reason as `currencyCode`
   *  (audit 01-F21): the previous hard-coded `.toLocaleString('en-US')`
   *  grouped every non-English profile's money in US convention. */
  locale: string
  /** Display pixel size for the integer digits. Decimals and currency glyph scale off this. */
  size?: number
  /** If true (default), uses serif display face per DESIGN.md "money is personal, not a spreadsheet". */
  serif?: boolean
  /** Dim the ink color (used when the amount is secondary — breakdown rows, hint copy). */
  muted?: boolean
  /** Font weight for sans variant. Serif rendering always uses 500. */
  sansWeight?: TextStyle['fontWeight']
  /** Override default text color (e.g. income green, destructive rose). */
  color?: string
  /** Extra style hook for the outer Text node (margin, alignment). */
  style?: TextStyle | TextStyle[]
}

/**
 * Money — matches the `Money` helper in docs/money-app/project/tokens.jsx.
 *
 * Rendering rules:
 *   - Digits, grouping, decimal separator and symbol placement come from
 *     `formatMoneyParts(value, currencyCode, locale)` (packages/shared) —
 *     the one Intl-backed formatter both platforms consume, instead of a
 *     hand-rolled glyph table and a hard-coded locale.
 *   - Currency glyph rendered at 58% of display size, opacity 0.55, slightly
 *     raised off the baseline so it tucks above the integer — positioned
 *     before or after the digits per `symbolFirst` ("$92" vs a locale
 *     where the symbol trails the amount).
 *   - Decimal separator + fraction digits rendered at opacity 0.55
 *     (de-emphasized).
 *   - Tabular figures via `fontVariant: ['tabular-nums']` so columns of
 *     amounts align.
 *   - Negative values render with a Unicode minus "−" (not ASCII hyphen) for
 *     typographic weight.
 *
 * Chooses serif for big hero amounts, sans-display for row-level amounts.
 */
export function Money({
  value,
  currencyCode,
  locale,
  size = 28,
  serif = true,
  muted = false,
  sansWeight = '600',
  color,
  style,
}: Props) {
  const isNeg = value < 0
  const { symbol, symbolFirst, integer, decimal, fraction } = formatMoneyParts(value, currencyCode, locale)

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
  const glyphStyle: TextStyle = {
    opacity: 0.55,
    fontSize: glyphSize,
    lineHeight: glyphLineHeight,
    textAlignVertical: glyphBaseline,
  }

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
      {symbolFirst && <Text style={glyphStyle}>{symbol}</Text>}
      {integer}
      {(decimal || fraction) && <Text style={{ opacity: 0.55 }}>{decimal}{fraction}</Text>}
      {!symbolFirst && <Text style={glyphStyle}>{' ' + symbol}</Text>}
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
