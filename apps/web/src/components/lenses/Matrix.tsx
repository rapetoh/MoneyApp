import React from 'react'
import { colors, font } from '../../lib/theme'
import { type LensProps, toSummarizable, buildCategoryColorMap, NEUTRAL_CATEGORY_COLOR } from './types'
import { addMonthsClamped, monthBounds, summarize, categoryPalette } from '@voice-expense/shared'

// 6-month × category grid. Rows = categories. Cols = trailing 6 months.
// Cell intensity scales with amount; trend column shows a tiny sparkline +
// percent delta vs the prior month.
//
// ROOT CAUSE (fix-plan 2.11's done-when, audit 05-F36/05-F37): this used
// to filter `t.direction !== 'debit'` and sum raw `aggAmount(t)` — no
// transfer exclusion (a Savings & Investing debit counted as spend here
// exactly like the MindMap bug this file's sibling fixes) — then
// truncated to the top 8 categories by latest-month spend and labelled
// the sum over *only those 8* "Total". A month with more than 8 active
// categories therefore rendered a "Total" smaller than the Overview
// header's "out" figure 600px above it. Fixed by routing every cell
// through `summarize()` (fix-plan 1.4) per trailing month — the same
// transfer-exclusion and FX-pending-exclusion rules the Overview header
// uses — and by folding every category past the top 8 into an explicit
// "Other · N categories" row instead of silently dropping it, so
// `Total = Σ(top 8) + Other` is `summarize()`'s `expense` by
// construction, for every month including the anchor month.

function fmtShort(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

interface MonthCol {
  label: string
  /** Half-open UTC instant bounds — string comparison only, never a
   *  `Date` (fix-plan 2.4). */
  start: string
  endExclusive: string
}

/** Trailing 6 calendar months ending at `anchorMonthIso`, resolved
 *  through `period.ts`'s `addMonthsClamped`/`monthBounds` in `tz` —
 *  replaces a `new Date(anchorYear, anchorMonth - i, 1)` build, which
 *  ran in the *browser's* local zone and could misclassify a
 *  transaction near a month boundary relative to the profile's own zone. */
function buildMonths(anchorMonthIso: string, tz: string, locale: string): MonthCol[] {
  const [y, m] = anchorMonthIso.split('-').map(Number)
  const out: MonthCol[] = []
  for (let i = 5; i >= 0; i--) {
    const target = addMonthsClamped(y, m, 1, -i)
    const iso = `${String(target.y).padStart(4, '0')}-${String(target.m).padStart(2, '0')}`
    const bounds = monthBounds(iso, tz)
    const label = new Date(bounds.start).toLocaleDateString(locale, { month: 'short', timeZone: tz })
    out.push({ label, start: bounds.start, endExclusive: bounds.endExclusive })
  }
  return out
}

export function MatrixLens({ props }: { props: LensProps }) {
  const months = buildMonths(props.monthIso, props.timezone, props.locale)
  const summarizable = props.transactions.map(toSummarizable)

  // Per-month category breakdown, transfer- and FX-pending-excluded —
  // the same `summarize()` (fix-plan 1.4) the Overview header's "out"
  // routes through, so this grid can never disagree with it (see this
  // file's header comment).
  const monthSummaries = months.map((m) =>
    summarize(summarizable, { start: m.start, endExclusive: m.endExclusive }),
  )

  // Row set = every category with recorded spend in any of the 6
  // months, keyed by category id (or the shared "uncategorized" key) —
  // never by display name, so two categories that happen to share a
  // name can't collapse into one row.
  const catIds = new Set<string>()
  for (const s of monthSummaries) {
    for (const id of Object.keys(s.byCategory)) catIds.add(id)
  }
  const nameById: Record<string, string> = {}
  const colorById = buildCategoryColorMap(props.categories)
  const matrix: Record<string, number[]> = {}
  for (const id of catIds) {
    matrix[id] = monthSummaries.map((s) => s.byCategory[id]?.amount ?? 0)
    nameById[id] =
      monthSummaries.find((s) => s.byCategory[id])?.byCategory[id]?.categoryName ?? 'Uncategorized'
  }

  // Sort by latest-month (anchor month) spend desc; the top 8 get their
  // own row, everything past that folds into one "Other · N categories"
  // row instead of being silently dropped — see this file's header
  // comment for why that's what makes `Total` agree with the Overview.
  const rankedIds = [...catIds].sort((a, b) => matrix[b][months.length - 1] - matrix[a][months.length - 1])
  const topIds = rankedIds.slice(0, 8)
  const otherIds = rankedIds.slice(8)
  const otherRow = months.map((_, mi) => otherIds.reduce((s, id) => s + matrix[id][mi], 0))
  const hasOther = otherIds.length > 0

  const max = Math.max(...topIds.flatMap((id) => matrix[id]), ...(hasOther ? otherRow : [0]), 1)

  // Equal to `monthSummaries[mi].expense` by construction — the sum
  // over *every* category (top 8 + Other), never a sum over a
  // truncated set (05-F36/05-F37). For the anchor month
  // (`mi === months.length - 1`) this is exactly the Overview header's
  // "out" figure for the same month (fix-plan 2.11's done-when).
  const totals = monthSummaries.map((s) => s.expense)

  // Shared row renderer — used for each of the top-8 category rows and,
  // once more, for the trailing "Other · N categories" row, so the two
  // never drift into two different cell layouts.
  const renderRow = (key: string, label: string, swatch: string, row: number[]) => {
    const last = row[row.length - 1]
    const prev = row[row.length - 2] || 0
    const trendUp = prev > 0 ? last > prev : false
    const pct = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null
    return (
      <React.Fragment key={key}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: swatch }} />
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
            {label}
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
  }

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

        {topIds.map((id) =>
          renderRow(id, nameById[id], categoryPalette(colorById[id] || NEUTRAL_CATEGORY_COLOR).fg, matrix[id]),
        )}
        {/* Everything past the top 8, folded into one row rather than
            dropped — this is what makes `Total` below agree with the
            Overview header's "out" (fix-plan 2.11's done-when). */}
        {hasOther &&
          renderRow(
            '__matrix_other_row__',
            `Other · ${otherIds.length} categor${otherIds.length === 1 ? 'y' : 'ies'}`,
            colors.ink4,
            otherRow,
          )}

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
      {topIds.length === 0 && !hasOther && (
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
