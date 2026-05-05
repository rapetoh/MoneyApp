'use client'
import { useState } from 'react'
import { colors, font, cat as catTokens } from '../../lib/theme'
import { tintFor } from '../../lib/categories'
import { type LensProps, monthDebits } from './types'

function fmt(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function CalendarLens({ props }: { props: LensProps }) {
  const debits = monthDebits(props)
  const year = props.monthStart.getFullYear()
  const monthIdx = props.monthStart.getMonth()
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  // Mon-first offset: Sun=0..Sat=6 -> Mon=0..Sun=6
  const firstDow = (props.monthStart.getDay() + 6) % 7

  // Bucket totals + tx-list by day.
  const dayTotal = new Array(daysInMonth + 1).fill(0)
  const dayTxns: Record<number, typeof debits> = {}
  for (const t of debits) {
    const d = new Date(t.transacted_at)
    if (d.getMonth() !== monthIdx || d.getFullYear() !== year) continue
    const day = d.getDate()
    dayTotal[day] += t.amount
    if (!dayTxns[day]) dayTxns[day] = []
    dayTxns[day].push(t)
  }
  const max = Math.max(...dayTotal, 1)

  // Pick "today" if we're in the current month; otherwise the heaviest day
  // as the default selected.
  const now = new Date()
  const isCurrentMonth = now.getMonth() === monthIdx && now.getFullYear() === year
  let defaultSel = 1
  if (isCurrentMonth) {
    defaultSel = now.getDate()
  } else {
    let best = -1
    for (let d = 1; d <= daysInMonth; d++) {
      if (dayTotal[d] > best) {
        best = dayTotal[d]
        defaultSel = d
      }
    }
  }
  const [sel, setSel] = useState(defaultSel)

  // Heaviest day for the eyebrow.
  let heaviestDay = 1
  let heaviestVal = -1
  for (let d = 1; d <= daysInMonth; d++) {
    if (dayTotal[d] > heaviestVal) {
      heaviestVal = dayTotal[d]
      heaviestDay = d
    }
  }

  const cells: Array<{ d: number | null }> = []
  for (let i = 0; i < firstDow; i++) cells.push({ d: null })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d })
  while (cells.length % 7 !== 0) cells.push({ d: null })

  const selDate = new Date(year, monthIdx, sel)
  const selWeekday = selDate.toLocaleDateString(props.locale, { weekday: 'long' })
  const selMonthDay = selDate.toLocaleDateString(props.locale, { month: 'short', day: 'numeric' })
  const selTxns = dayTxns[sel] ?? []
  const selTotal = dayTotal[sel] ?? 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, height: 600, fontFamily: font.sans }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
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
              {props.monthLabel} · daily spend
            </div>
            <div style={{ fontSize: 13, color: colors.ink3, marginTop: 4 }}>
              {heaviestVal > 0 ? (
                <>
                  Heaviest:{' '}
                  <b style={{ color: colors.ink }}>
                    {props.monthLabel} {heaviestDay} · {fmt(heaviestVal, props.currency, props.locale)}
                  </b>
                </>
              ) : (
                <>No spending logged this month yet.</>
              )}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              color: colors.ink3,
              fontWeight: 600,
            }}
          >
            <span>Quiet</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {[0.18, 0.32, 0.46, 0.62, 0.82].map((v, i) => (
                <div
                  key={i}
                  style={{ width: 16, height: 12, borderRadius: 2, background: `rgba(63,90,62,${v})` }}
                />
              ))}
            </div>
            <span>Heavy</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div
              key={d}
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: colors.ink4,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                textAlign: 'center',
              }}
            >
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, flex: 1 }}>
          {cells.map((c, i) => {
            const day = c.d
            if (!day) {
              return <div key={i} />
            }
            const v = dayTotal[day]
            const intensity = Math.min(0.92, v / max)
            const isToday = isCurrentMonth && day === now.getDate()
            const isSel = day === sel
            const bg = v > 0 ? `rgba(63,90,62,${0.08 + intensity * 0.7})` : colors.surface
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSel(day)}
                style={{
                  aspectRatio: 1.05,
                  borderRadius: 8,
                  background: bg,
                  border: isSel
                    ? `2px solid ${colors.ink}`
                    : isToday
                      ? `1.5px solid ${colors.accent}`
                      : `0.5px solid ${colors.line}`,
                  padding: 6,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontFamily: font.sans,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: intensity > 0.5 ? '#fff' : colors.ink2,
                  }}
                >
                  {day}
                </div>
                {v > 0 && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: intensity > 0.5 ? '#fff' : colors.ink2,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmt(v, props.currency, props.locale)}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
      {/* Day detail */}
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
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: colors.ink3,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {selWeekday} · {selMonthDay}
        </div>
        <div
          style={{
            fontFamily: font.display,
            fontSize: 32,
            fontWeight: 700,
            color: colors.ink,
            letterSpacing: -0.6,
          }}
        >
          {fmt(selTotal, props.currency, props.locale)}
        </div>
        <div style={{ fontSize: 12, color: colors.ink3, marginBottom: 14 }}>
          {selTxns.length} transaction{selTxns.length === 1 ? '' : 's'}
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {selTxns.map((t, i) => {
            const tint = tintFor(t.category_name ?? null)
            const c = catTokens[tint]
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderTop: i === 0 ? 'none' : `0.5px solid ${colors.line}`,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: c.bg,
                    color: c.fg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {(t.merchant ?? '?')[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t.merchant ?? 'Unnamed'}
                  </div>
                  <div style={{ fontSize: 11, color: colors.ink3 }}>{t.category_name ?? 'Uncategorized'}</div>
                </div>
                <div
                  style={{
                    fontFamily: font.sans,
                    fontSize: 14,
                    fontWeight: 600,
                    color: colors.ink,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  −{fmt(t.amount, props.currency, props.locale)}
                </div>
              </div>
            )
          })}
          {selTxns.length === 0 && (
            <div style={{ fontSize: 12, color: colors.ink3, padding: '20px 0', textAlign: 'center' }}>
              No transactions on this day.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
