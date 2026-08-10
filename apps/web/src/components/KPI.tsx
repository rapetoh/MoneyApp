import { colors, font, radius } from '../lib/theme'
import { Money } from './Money'
import { Icon } from './Icons'

export function KPI({
  label,
  value,
  currency,
  locale,
  delta,
  sub,
  small,
  custom,
  positiveIsGood = true,
  forecast = false,
}: {
  label: string
  value: number
  currency: string
  // Required — fix-plan 2.6: forwarded straight to `Money`, whose own
  // `locale` is required for the same reason (audit 01-F21). An
  // optional prop here would just move the silent-English-grouping
  // omission up one component instead of closing it.
  locale: string
  delta?: number
  sub?: string
  small?: boolean
  custom?: string
  positiveIsGood?: boolean
  /** When true, paints a subtle sparkle in the top-right corner so the
   *  user reads the figure as a projection, not a settled total. */
  forecast?: boolean
}) {
  const goodColor = colors.accent
  const goodSoft = colors.accentSoft
  const badColor = '#A94646'
  const badSoft = '#F4DDDD'
  const isGood = delta == null ? true : positiveIsGood ? delta > 0 : delta < 0
  const swatchColor = isGood ? goodColor : badColor
  const swatchBg = isGood ? goodSoft : badSoft

  return (
    <div
      style={{
        background: colors.card,
        borderRadius: radius.xl,
        padding: '16px 18px',
        border: `0.5px solid ${colors.line}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: colors.ink3,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 8 }}>
        <Money value={value} currency={currency} locale={locale} size={small ? 22 : 28} />
      </div>
      <div
        style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontFamily: font.sans,
        }}
      >
        {delta != null && (
          <span
            style={{
              color: swatchColor,
              background: swatchBg,
              padding: '2px 7px',
              borderRadius: 6,
              fontWeight: 700,
            }}
          >
            {delta < 0 ? '↓' : '↑'} {Math.abs(delta)}%
          </span>
        )}
        <span style={{ color: colors.ink3 }}>{custom || sub}</span>
      </div>
      {forecast && (
        <div style={{ position: 'absolute', top: 14, right: 14, lineHeight: 0 }}>
          <Icon.sparkle color={colors.ink4} size={14} />
        </div>
      )}
    </div>
  )
}
