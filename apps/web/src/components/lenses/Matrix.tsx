import React from 'react'
import { colors, font, cat as catTokens } from '../../lib/theme'
import { tintFor } from '../../lib/categories'
import type { LensProps } from './types'

// 6-month × category grid. Rows = categories. Cols = trailing 6 months.
// Cell intensity scales with amount; trend column shows a tiny sparkline +
// percent delta vs the prior month.

function fmtShort(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

interface MonthCol {
  label: string
  start: Date
  end: Date
}

function buildMonths(currentMonthStart: Date, locale: string): MonthCol[] {
  const out: MonthCol[] = []
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - i, 1)
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999)
    out.push({ label: ref.toLocaleDateString(locale, { month: 'short' }), start, end })
  }
  return out
}

export function MatrixLens({ props }: { props: LensProps }) {
  const months = buildMonths(props.monthStart, props.locale)

  // Aggregate spend per (category, monthIndex).
  const allCats = new Set<string>()
  const matrix: Record<string, number[]> = {}
  for (const t of props.transactions) {
    if (t.direction !== 'debit') continue
    const d = new Date(t.transacted_at)
    let mIdx = -1
    for (let i = 0; i < months.length; i++) {
      if (d >= months[i].start && d <= months[i].end) {
        mIdx = i
        break
      }
    }
    if (mIdx < 0) continue
    const k = t.category_name ?? 'Uncategorized'
    allCats.add(k)
    if (!matrix[k]) matrix[k] = new Array(months.length).fill(0)
    matrix[k][mIdx] += t.amount
  }

  // Sort by latest-month spend desc; trim to top 8 to keep the grid legible.
  const cats = [...allCats]
    .map((k) => ({ k, latest: matrix[k][months.length - 1] }))
    .sort((a, b) => b.latest - a.latest)
    .slice(0, 8)

  const max = Math.max(...cats.flatMap((c) => matrix[c.k]), 1)

  const totals = months.map((_, mi) => cats.reduce((s, c) => s + matrix[c.k][mi], 0))

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        border: `0.5px solid ${colors.line}`,
        padding: 20,
        height: 600,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: font.sans,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
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
            6-month matrix · category × month
          </div>
          <div style={{ fontSize: 13, color: colors.ink3, marginTop: 4 }}>
            Spot rising or falling categories instantly.
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `200px repeat(${months.length}, 1fr) 96px`,
          gap: 4,
          alignItems: 'stretch',
          flex: 1,
        }}
      >
        <div />
        {months.map((m) => (
          <div
            key={m.label}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: colors.ink3,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            {m.label}
          </div>
        ))}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: colors.ink3,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          Trend
        </div>

        {cats.map((c) => {
          const row = matrix[c.k]
          const last = row[row.length - 1]
          const prev = row[row.length - 2] || 0
          const trendUp = prev > 0 ? last > prev : false
          const pct = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null
          return (
            <React.Fragment key={c.k}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: catTokens[tintFor(c.k)].fg,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.ink2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.k}
                </span>
              </div>
              {row.map((v, mi) => {
                const intensity = v / max
                return (
                  <div
                    key={mi}
                    style={{
                      background: `rgba(63,90,62,${0.06 + intensity * 0.6})`,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      color: intensity > 0.5 ? '#fff' : colors.ink2,
                      fontVariantNumeric: 'tabular-nums',
                      minHeight: 36,
                    }}
                  >
                    {v > 0 ? fmtShort(v, props.currency, props.locale) : ''}
                  </div>
                )
              })}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  color: trendUp ? '#A94646' : colors.accent,
                }}
              >
                <Sparkline values={row} color={trendUp ? '#A94646' : colors.accent} />
                {pct != null && (
                  <span>
                    {trendUp ? '↑' : '↓'}
                    {Math.abs(pct)}%
                  </span>
                )}
              </div>
            </React.Fragment>
          )
        })}

        {/* Totals row */}
        <div
          style={{
            paddingLeft: 4,
            fontSize: 12,
            fontWeight: 800,
            color: colors.ink,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          Total
        </div>
        {totals.map((t, i) => (
          <div
            key={i}
            style={{
              background: colors.ink,
              color: '#fff',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtShort(t, props.currency, props.locale)}
          </div>
        ))}
        <div />
      </div>
      {cats.length === 0 && (
        <div style={{ fontSize: 13, color: colors.ink3, padding: '40px 20px', textAlign: 'center' }}>
          Not enough history yet to draw a 6-month matrix.
        </div>
      )}
    </div>
  )
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 50
  const h = 18
  const max = Math.max(...values)
  const min = Math.min(...values)
  const x = (i: number) => (i / Math.max(values.length - 1, 1)) * w
  const y = (v: number) => h - ((v - min) / Math.max(max - min, 1)) * h
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
