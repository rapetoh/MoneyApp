import { colors, font } from '../../lib/theme'
import { type LensProps, monthDebits, monthCredits } from './types'
import { aggAmount } from '@voice-expense/shared'

// Daily balance line over the month + per-day income / expense bars + a
// right summary panel breaking down income, expenses, and net.

function fmt(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

interface DayPoint {
  d: number
  inAmt: number
  outAmt: number
  bal: number
}

export function CashflowLens({ props }: { props: LensProps }) {
  const credits = monthCredits(props)
  const debits = monthDebits(props)
  // Timezone-free anchor numbers — see LensProps. Never read date getters
  // off the serialized monthStart instant.
  const year = props.anchorYear
  const monthIdx = props.anchorMonth
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()

  // Build per-day income/expense and a running "balance" relative to start.
  const points: DayPoint[] = []
  let bal = 0
  let totalIn = 0
  let totalOut = 0
  for (let d = 1; d <= daysInMonth; d++) {
    let inAmt = 0
    let outAmt = 0
    for (const t of credits) {
      const dd = new Date(t.transacted_at)
      if (dd.getFullYear() === year && dd.getMonth() === monthIdx && dd.getDate() === d) {
        inAmt += aggAmount(t)
      }
    }
    for (const t of debits) {
      const dd = new Date(t.transacted_at)
      if (dd.getFullYear() === year && dd.getMonth() === monthIdx && dd.getDate() === d) {
        outAmt += aggAmount(t)
      }
    }
    bal += inAmt - outAmt
    totalIn += inAmt
    totalOut += outAmt
    points.push({ d, inAmt, outAmt, bal })
  }

  const W = 1120
  const H = 460
  const padX = 40
  const padY = 40
  const allBalances = points.map((p) => p.bal)
  const maxAbs = Math.max(...allBalances.map(Math.abs), totalIn, 1)
  const maxY = maxAbs * 1.15
  const minY = -Math.max(0, maxAbs * 0.2)

  const x = (d: number) => padX + ((d - 1) / Math.max(daysInMonth - 1, 1)) * (W - padX * 2)
  const y = (v: number) => H - padY - ((v - minY) / Math.max(maxY - minY, 1)) * (H - padY * 2)
  const balPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.d)},${y(p.bal)}`).join(' ')
  const balArea = `${balPath} L ${x(daysInMonth)},${y(0)} L ${x(1)},${y(0)} Z`

  const net = totalIn - totalOut
  const savingsRate = totalIn > 0 ? Math.round((net / totalIn) * 100) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, height: 600, fontFamily: font.sans }}>
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          border: `0.5px solid ${colors.line}`,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: colors.ink3,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            Cashflow · {props.monthLabel}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
            <span
              style={{
                fontFamily: font.serif,
                fontSize: 28,
                fontWeight: 500,
                color: colors.ink,
                letterSpacing: -0.5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmt(bal, props.currency, props.locale)}
            </span>
            <span style={{ fontSize: 12, color: colors.ink3 }}>
              balance · day {daysInMonth}
            </span>
            {net >= 0 && (
              <span
                style={{
                  fontSize: 11,
                  color: colors.accent,
                  fontWeight: 700,
                  background: colors.accentSoft,
                  padding: '2px 7px',
                  borderRadius: 6,
                }}
              >
                ↑ {fmt(net, props.currency, props.locale)} net
              </span>
            )}
            {net < 0 && (
              <span
                style={{
                  fontSize: 11,
                  color: '#A94646',
                  fontWeight: 700,
                  background: '#F4DDDD',
                  padding: '2px 7px',
                  borderRadius: 6,
                }}
              >
                ↓ {fmt(Math.abs(net), props.currency, props.locale)} net
              </span>
            )}
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', flex: 1 }}>
          <defs>
            <linearGradient id="balGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={colors.accent} stopOpacity="0.22" />
              <stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((i) => {
            const v = maxY - i * (maxY / 3)
            return (
              <g key={i}>
                <line
                  x1={padX}
                  x2={W - padX}
                  y1={y(v)}
                  y2={y(v)}
                  stroke={colors.line}
                  strokeDasharray="2 3"
                />
                <text x={8} y={y(v) + 4} fontSize="10" fill={colors.ink4} fontWeight="600">
                  {fmt(v, props.currency, props.locale)}
                </text>
              </g>
            )
          })}
          <line x1={padX} x2={W - padX} y1={y(0)} y2={y(0)} stroke={colors.ink4} strokeWidth="0.5" />
          {points.map((p, i) => (
            <g key={i}>
              {p.inAmt > 0 && (
                <rect
                  x={x(p.d) - 4}
                  y={y(0) - (p.inAmt / maxY) * (H - padY * 2) * 0.5}
                  width="8"
                  height={(p.inAmt / maxY) * (H - padY * 2) * 0.5}
                  rx="2"
                  fill={colors.accent}
                  opacity="0.85"
                />
              )}
              {p.outAmt > 0 && (
                <rect
                  x={x(p.d) - 4}
                  y={y(0)}
                  width="8"
                  height={(p.outAmt / maxY) * (H - padY * 2) * 0.5}
                  rx="2"
                  fill="#A94646"
                  opacity="0.6"
                />
              )}
            </g>
          ))}
          <path d={balArea} fill="url(#balGrad)" />
          <path d={balPath} fill="none" stroke={colors.accent} strokeWidth="2.5" />
          {points.length > 0 && (
            <circle
              cx={x(daysInMonth)}
              cy={y(points[points.length - 1].bal)}
              r="5"
              fill="#fff"
              stroke={colors.accent}
              strokeWidth="2.5"
            />
          )}
          {[1, 5, 10, 15, 20, 25, daysInMonth].map((d) => (
            <text
              key={d}
              x={x(d)}
              y={H - padY + 18}
              fontSize="10"
              fill={colors.ink3}
              textAnchor="middle"
              fontWeight="600"
            >
              {d}
            </text>
          ))}
        </svg>
      </div>
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          border: `0.5px solid ${colors.line}`,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <Stat
          label="Income"
          value={totalIn}
          color={colors.accent}
          currency={props.currency}
          locale={props.locale}
        />
        <div style={{ height: 1, background: colors.line }} />
        <Stat
          label="Expenses"
          value={totalOut}
          color="#A94646"
          currency={props.currency}
          locale={props.locale}
        />
        <div style={{ height: 1, background: colors.line }} />
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: colors.ink3,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            Net
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: font.serif,
              fontSize: 26,
              fontWeight: 500,
              color: net >= 0 ? colors.accent : '#A94646',
              letterSpacing: -0.5,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {net >= 0 ? '+' : '−'}
            {fmt(Math.abs(net), props.currency, props.locale)}
          </div>
          {savingsRate != null && net >= 0 && (
            <div style={{ fontSize: 11, color: colors.ink3, marginTop: 4 }}>
              {savingsRate}% savings rate
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  color,
  currency,
  locale,
}: {
  label: string
  value: number
  color: string
  currency: string
  locale: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
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
        <div
          style={{
            fontFamily: font.sans,
            fontSize: 18,
            fontWeight: 700,
            color: colors.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
          }).format(value)}
        </div>
      </div>
      <div style={{ height: 8, marginTop: 8, borderRadius: 4, background: colors.surface2 }}>
        <div style={{ width: '100%', height: '100%', background: color, opacity: 0.85, borderRadius: 4 }} />
      </div>
    </div>
  )
}
