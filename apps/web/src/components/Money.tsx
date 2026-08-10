// Money figures with serif (New York / Iowan Old Style) per brand sheet §03.
// Smaller figures fall back to display sans. Currency + locale come from the
// caller (usually plumbed from `profile.currency_code` / `profile.locale`) so
// EUR/GBP/XAF/JPY users see the right symbol + grouping conventions instead
// of a hard-coded `$`.
import { colors, font } from '../lib/theme'
import { formatMoneyParts } from '@voice-expense/shared'

type Props = {
  value: number
  currency: string
  /** BCP 47 locale for digit grouping and the decimal separator — e.g.
   *  `profile.locale`. Required: fix-plan 2.6 (audit 01-F21). The old
   *  `locale = 'en'` default is the same class of defect `sign = '$'`
   *  was on mobile — every call site already threads a real locale
   *  (verified: none currently rely on the default), so making it
   *  required costs nothing today and stops a future call site from
   *  silently reintroducing English grouping under a non-English
   *  currency. */
  locale: string
  size?: number
  muted?: boolean
  serif?: boolean
  bold?: number
  /** Force a leading + when value is positive (used on income/credit rows). */
  showPositiveSign?: boolean
  /** Override the text color. Defaults to ink (or ink3 when muted). */
  color?: string
}

export function Money({
  value,
  currency,
  locale,
  size = 28,
  muted = false,
  serif = true,
  bold = 600,
  showPositiveSign = false,
  color,
}: Props) {
  const isNeg = value < 0
  // formatMoneyParts (packages/shared/src/utils/currency.ts) is the one
  // Intl-backed formatter both platforms consume — this used to be a
  // hand-rolled `formatToParts` call duplicating that module exactly.
  const { symbol, symbolFirst, integer, decimal, fraction } = formatMoneyParts(value, currency, locale)

  const sign = isNeg ? '−' : showPositiveSign ? '+' : ''

  return (
    <span
      style={{
        fontFamily: serif ? font.serif : font.display,
        fontSize: size,
        fontWeight: serif ? 500 : bold,
        color: color ?? (muted ? colors.ink3 : colors.ink),
        letterSpacing: serif ? -0.5 : -0.8,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {sign}
      {symbolFirst && (
        <SymbolSpan symbol={symbol} size={size} />
      )}
      {integer}
      <span style={{ opacity: 0.55 }}>
        {decimal}
        {fraction}
      </span>
      {!symbolFirst && (
        <SymbolSpan symbol={' ' + symbol} size={size} />
      )}
    </span>
  )
}

function SymbolSpan({ symbol, size }: { symbol: string; size: number }) {
  if (!symbol) return null
  return (
    <span
      style={{
        opacity: 0.55,
        fontSize: size * 0.58,
        marginRight: 1,
        verticalAlign: size > 40 ? '0.4em' : '0.15em',
      }}
    >
      {symbol}
    </span>
  )
}
