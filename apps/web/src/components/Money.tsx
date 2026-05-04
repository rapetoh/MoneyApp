// Money figures with serif (New York / Iowan Old Style) per brand sheet §03.
// Smaller figures fall back to display sans. Currency + locale come from the
// caller (usually plumbed from `profile.currency_code` / `profile.locale`) so
// EUR/GBP/XAF/JPY users see the right symbol + grouping conventions instead
// of a hard-coded `$`.
import { colors, font } from '../lib/theme'

type Props = {
  value: number
  currency: string
  locale?: string
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
  locale = 'en',
  size = 28,
  muted = false,
  serif = true,
  bold = 600,
  showPositiveSign = false,
  color,
}: Props) {
  const isNeg = value < 0
  const abs = Math.abs(value)
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(abs)

  const symbol = parts.find((p) => p.type === 'currency')?.value ?? ''
  const integer = parts
    .filter((p) => p.type === 'integer' || p.type === 'group')
    .map((p) => p.value)
    .join('')
  const fraction = parts.find((p) => p.type === 'fraction')?.value ?? '00'
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.'
  const symbolFirst = parts[0]?.type === 'currency'

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
