'use client'
import { useState } from 'react'
import { colors, font } from '../../lib/theme'
import { categoryPalette } from '@voice-expense/shared'
import { type LensDay, type LensProps, buildCategoryColorMap, NEUTRAL_CATEGORY_COLOR } from './types'

function fmt(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function CalendarLens({ props }: { props: LensProps }) {
  // Every day's total, weekday alignment and transaction list is
  // bucketed once in `dashboard/page.tsx` through `period.ts`, in the
  // profile's own timezone — this lens does no date arithmetic of its
  // own (fix-plan 2.4). Reading `getMonth()`/`getDay()` off a `Date`
  // built in the *browser's* zone (or the server's, before that) is what
  // shifted the whole grid a month back for any browser west of UTC —
  // August rendered as July's empty grid under a "JUL 8" day panel, and
  // separately misaligned the weekday header for any zone that doesn't
  // match the browser's own (Aug 1 2026 is a Saturday; a wrong-zone
  // browser could read it as Friday or Sunday).
  const days = props.days
  const max = Math.max(...days.map((d) => d.spendTotal), 1)
  const colorById = buildCategoryColorMap(props.categories)

  // Today's cell, if the anchor month is the current one — `todayIso` is
  // resolved server-side in the profile's zone, never `new Date()` here.
  const isCurrentMonth = days.some((d) => d.isoDate === props.todayIso)

  // Heaviest day for the eyebrow and the default selection when viewing
  // a month that isn't the current one.
  const heaviest = days.reduce<LensDay | null>(
    (best, d) => (best == null || d.spendTotal > best.spendTotal ? d : best),
    null,
  )
  const defaultSel = isCurrentMonth ? props.todayIso : (heaviest?.isoDate ?? days[0]?.isoDate ?? props.todayIso)
  const [sel, setSel] = useState(defaultSel)

  // Leading blanks so day 1 lands under its real weekday column
  // (`weekdayIndex`: Monday=0…Sunday=6, from `period.ts`), then trailing
  // blanks to pad the grid to a whole number of weeks.
  const cells: Array<LensDay | null> = []
  const firstDow = days[0]?.weekdayIndex ?? 0
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (const d of days) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const selDay = days.find((d) => d.isoDate === sel) ?? days[0]
  const selWeekday = selDay
    ? new Date(selDay.windowStart).toLocaleDateString(props.locale, { weekday: 'long', timeZone: props.timezone })
    : ''
  const selMonthDay = selDay
    ? new Date(selDay.windowStart).toLocaleDateString(props.locale, {
        month: 'short',
        day: 'numeric',
        timeZone: props.timezone,
      })
    : ''
  const selTxns = selDay?.txns ?? []
  const selTotal = selDay?.spendTotal ?? 0

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
              {heaviest && heaviest.spendTotal > 0 ? (
                <>
                  Heaviest:{' '}
                  <b style={{ color: colors.ink }}>
                    {props.monthLabel} {heaviest.dayOfMonth} · {fmt(heaviest.spendTotal, props.currency, props.locale)}
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
          {cells.map((day, i) => {
            if (!day) {
              return <div key={i} />
            }
            const v = day.spendTotal
            const intensity = Math.min(0.92, v / max)
            const isToday = day.isoDate === props.todayIso
            const isSel = day.isoDate === sel
            const bg = v > 0 ? `rgba(63,90,62,${0.08 + intensity * 0.7})` : colors.surface
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSel(day.isoDate)}
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
                  {day.dayOfMonth}
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
            const c = categoryPalette((t.category_id && colorById[t.category_id]) || NEUTRAL_CATEGORY_COLOR)
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
                <div style={{ textAlign: 'right' }}>
                  {/* Fix-plan 2.6 (calendar day-detail raw-amount site,
                      audit F14-class): each row renders in its OWN
                      currency — `t.amount` was previously formatted with
                      `props.currency` (the profile's), so a foreign-
                      currency row showed its native number under the
                      wrong symbol and the panel's rows visibly didn't
                      sum to the day total above them, which sums
                      `amount_in_profile_currency` via `LensDay.spendTotal`. */}
                  <div
                    style={{
                      fontFamily: font.sans,
                      fontSize: 14,
                      fontWeight: 600,
                      color: colors.ink,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    −{fmt(t.amount, t.currency_code, props.locale)}
                  </div>
                  {t.currency_code !== props.currency && t.amount_in_profile_currency != null && (
                    <div
                      style={{
                        fontFamily: font.sans,
                        fontSize: 11,
                        color: colors.ink3,
                        fontVariantNumeric: 'tabular-nums',
                        marginTop: 1,
                      }}
                    >
                      ≈ {fmt(t.amount_in_profile_currency, props.currency, props.locale)}
                    </div>
                  )}
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
