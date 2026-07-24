import { colors, font, cat as catTokens, type CategoryTint } from '../../lib/theme'
import { tintFor } from '../../lib/categories'
import { type LensProps, monthDebits, monthCredits, groupByCategory } from './types'
import { aggAmount } from '@voice-expense/shared'

// Sankey-style flow: income (left) -> categories (middle) -> top merchants
// (right). Width of each ribbon is proportional to amount. We compute the
// flows from real data; if a column is empty, that side renders blank but
// the chart still tells a story.

function tintFG(name: string): string {
  const k = tintFor(name) as CategoryTint
  return catTokens[k].fg
}

function fmt(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

interface Node {
  label: string
  amt: number
  color: string
  y: number
  h: number
  mid: number
}

// Sankey columns break visually when items have wildly different
// magnitudes — a $20K item dwarfs a $20 item to the point where the
// small one becomes 0.05% of the column and its label crashes into
// every neighbour. Cap the column at 8 items, give each a minimum
// 26 px slot so the label has room to breathe, and distribute the
// remaining height proportionally to amount.
function stack(
  items: Array<{ label: string; amt: number; color: string }>,
  height: number,
): Node[] {
  if (items.length === 0) return []
  const MIN_H = 26
  const MAX_ITEMS = 8
  const sorted = [...items].sort((a, b) => b.amt - a.amt).slice(0, MAX_ITEMS)
  const total = sorted.reduce((s, i) => s + i.amt, 0)
  if (total <= 0) return []

  const gap = 8
  const totalGap = gap * Math.max(0, sorted.length - 1)
  const minTotal = MIN_H * sorted.length
  const usable = Math.max(MIN_H * sorted.length, height - totalGap)
  const flexible = Math.max(0, usable - minTotal)

  let y = 20
  return sorted.map((it) => {
    const h = MIN_H + (it.amt / total) * flexible
    const node: Node = { ...it, y, h, mid: y + h / 2 }
    y += h + gap
    return node
  })
}

const curve = (x1: number, y1: number, x2: number, y2: number): string => {
  const cx = (x1 + x2) / 2
  return `M ${x1},${y1} C ${cx},${y1} ${cx},${y2} ${x2},${y2}`
}

export function FlowLens({ props }: { props: LensProps }) {
  const W = 1180
  const H = 600
  const colW = 26
  const left = 80
  const midL = 380
  const midR = 720

  const credits = monthCredits(props)
  const debits = monthDebits(props)
  const incomeTotal = credits.reduce((s, t) => s + aggAmount(t), 0)

  // Income column — group by category name. If income has no category
  // ("salary deposits" not categorized), they all roll into "Income".
  const incomeByCat = groupByCategory(credits)
  const incomeNodes = stack(
    Object.entries(incomeByCat)
      .map(([name, amt]) => ({ label: name, amt, color: colors.accent }))
      .sort((a, b) => b.amt - a.amt),
    H - 40,
  )

  // Category column.
  const expenseByCat = groupByCategory(debits)
  const catNodes = stack(
    Object.entries(expenseByCat)
      .map(([name, amt]) => ({ label: name, amt, color: tintFG(name) }))
      .sort((a, b) => b.amt - a.amt),
    H - 40,
  )

  // Merchant column — each merchant attached to the category that
  // produced the most of it. Simpler than full per-category subcolumns.
  const merchTotals: Record<string, { amt: number; cat: string }> = {}
  for (const t of debits) {
    const m = t.merchant ?? 'Other'
    const c = t.category_name ?? 'Uncategorized'
    const amt = aggAmount(t)
    if (!merchTotals[m] || merchTotals[m].amt < amt) {
      merchTotals[m] = { amt: (merchTotals[m]?.amt ?? 0) + amt, cat: c }
    } else {
      merchTotals[m].amt += amt
    }
  }
  const merchList = Object.entries(merchTotals)
    .map(([m, x]) => ({ label: m, amt: x.amt, color: tintFG(x.cat), parentCat: x.cat }))
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 8)
  const merchNodes = stack(merchList, H - 40)

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        border: `0.5px solid ${colors.line}`,
        padding: 20,
        height: 600,
        fontFamily: font.sans,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
            Money flow · {props.monthLabel}
          </div>
          <div style={{ fontSize: 13, color: colors.ink3, marginTop: 4 }}>
            How {fmt(incomeTotal, props.currency, props.locale)} of income moved through your month.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: colors.ink3, fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: colors.accent }} />
            Income
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: catTokens.bills.fg }} />
            Spent
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', flex: 1 }}>
        {/* Income -> Category ribbons. Each income source spreads its amount
            across category nodes proportionally. */}
        {incomeNodes.map((src, i) => {
          let off = 0
          return catNodes.map((dst, j) => {
            const share = (dst.amt / Math.max(catNodes.reduce((s, x) => s + x.amt, 0), 1)) * src.h
            const y1 = src.y + off + share / 2
            off += share
            // dst offset — each dst gets a slice from each src
            const dstOff =
              incomeNodes
                .slice(0, i)
                .reduce((s, x) => s + (dst.amt / Math.max(catNodes.reduce((q, n) => q + n.amt, 0), 1)) * x.h, 0)
            const y2 = dst.y + dstOff + share / 2
            return (
              <path
                key={`a-${i}-${j}`}
                d={curve(left + colW, y1, midL, y2)}
                stroke={dst.color}
                strokeOpacity="0.28"
                strokeWidth={Math.max(2, share)}
                fill="none"
              />
            )
          })
        })}

        {/* Category -> Merchant ribbons. Each merchant inherits the dst
            category's color (simpler than slicing per-merchant from src). */}
        {catNodes.map((dst, ci) => {
          const subs = merchNodes.filter((m) => m.color === dst.color)
          let acc = 0
          return subs.map((s, si) => {
            const thickness = Math.max(1.5, (s.amt / Math.max(dst.amt, 1)) * dst.h * 0.9)
            const y1 = dst.y + acc + thickness / 2
            acc += thickness
            return (
              <path
                key={`b-${ci}-${si}`}
                d={curve(midL + colW, y1, midR, s.mid)}
                stroke={dst.color}
                strokeOpacity="0.22"
                strokeWidth={thickness}
                fill="none"
              />
            )
          })
        })}

        {/* Income column */}
        {incomeNodes.map((n, i) => (
          <g key={`in-${i}`}>
            <rect x={left} y={n.y} width={colW} height={n.h} rx={2} fill={n.color} />
            <text x={left - 10} y={n.mid + 4} fontSize="12" fill={colors.ink2} fontWeight="600" textAnchor="end">
              {n.label}
            </text>
            <text
              x={left - 10}
              y={n.mid + 18}
              fontSize="10"
              fill={colors.ink4}
              textAnchor="end"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fmt(n.amt, props.currency, props.locale)}
            </text>
          </g>
        ))}

        {/* Category column */}
        {catNodes.map((n, i) => (
          <g key={`cat-${i}`}>
            <rect x={midL} y={n.y} width={colW} height={n.h} rx={2} fill={n.color} />
            <text x={midL + colW + 10} y={n.mid + 4} fontSize="12" fill={colors.ink} fontWeight="700">
              {n.label}
            </text>
            <text
              x={midL + colW + 10}
              y={n.mid + 18}
              fontSize="10"
              fill={colors.ink3}
              fontWeight="600"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fmt(n.amt, props.currency, props.locale)}
            </text>
          </g>
        ))}

        {/* Merchant column */}
        {merchNodes.map((n, i) => (
          <g key={`m-${i}`}>
            <rect x={midR} y={n.y} width={colW} height={n.h} rx={2} fill={n.color} opacity="0.7" />
            <text x={midR + colW + 10} y={n.mid + 4} fontSize="11" fill={colors.ink2} fontWeight="600">
              {n.label}
            </text>
            <text
              x={midR + colW + 10}
              y={n.mid + 17}
              fontSize="10"
              fill={colors.ink4}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fmt(n.amt, props.currency, props.locale)}
            </text>
          </g>
        ))}

        {(incomeNodes.length === 0 || catNodes.length === 0) && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="14" fill={colors.ink3}>
            Not enough data this month to draw a flow. Log a few transactions to see it fill in.
          </text>
        )}
      </svg>
    </div>
  )
}
