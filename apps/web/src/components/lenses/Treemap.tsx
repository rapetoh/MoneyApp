import { colors, font, cat as catTokens } from '../../lib/theme'
import { tintFor } from '../../lib/categories'
import { type LensProps, monthDebits, monthCredits, groupByCategory } from './types'

// Treemap of category spend for the month. Saved & invested gets its own
// row at the bottom (income - debits) so the whole money picture is one
// canvas. Layout uses a simple squarified-ish algorithm tuned for 6-10
// categories — not perfect packing, but good enough for one-page reads.

function fmt(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

interface Cell {
  x: number
  y: number
  w: number
  h: number
  label: string
  amt: number
  color: string
  big: boolean
}

function layoutCells(
  items: Array<{ label: string; amt: number; color: string }>,
  totalSpace: number,
): Cell[] {
  if (items.length === 0) return []
  const total = items.reduce((s, i) => s + i.amt, 0)
  if (total <= 0) return []

  // Two-row layout: top row 80% height for the bigger items, bottom row 20%
  // for the long tail.
  const sorted = [...items].sort((a, b) => b.amt - a.amt)
  const totalTop = Math.min(sorted.length, 4)
  const topItems = sorted.slice(0, totalTop)
  const tailItems = sorted.slice(totalTop)

  const cells: Cell[] = []
  const topTotal = topItems.reduce((s, i) => s + i.amt, 0)
  let xCursor = 0
  for (const it of topItems) {
    const w = (it.amt / Math.max(topTotal, 1)) * 100
    cells.push({
      x: xCursor,
      y: 0,
      w,
      h: tailItems.length > 0 ? 80 : 100,
      label: it.label,
      amt: it.amt,
      color: it.color,
      big: w * 80 > 1000,
    })
    xCursor += w
  }
  if (tailItems.length > 0) {
    const tailTotal = tailItems.reduce((s, i) => s + i.amt, 0)
    let xt = 0
    for (const it of tailItems) {
      const w = (it.amt / Math.max(tailTotal, 1)) * 100
      cells.push({
        x: xt,
        y: 80,
        w,
        h: 20,
        label: it.label,
        amt: it.amt,
        color: it.color,
        big: false,
      })
      xt += w
    }
  }
  void totalSpace
  return cells
}

export function TreemapLens({ props }: { props: LensProps }) {
  const debits = monthDebits(props)
  const credits = monthCredits(props)
  const incomeTotal = credits.reduce((s, t) => s + t.amount, 0)
  const expenseTotal = debits.reduce((s, t) => s + t.amount, 0)
  const saved = Math.max(0, incomeTotal - expenseTotal)

  const debitsByCat = groupByCategory(debits)
  const items = Object.entries(debitsByCat).map(([name, amt]) => ({
    label: name,
    amt,
    color: catTokens[tintFor(name)].fg,
  }))

  const cells = layoutCells(items, 100)

  const totalFlow = expenseTotal + saved

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
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
            Where it all goes · sized by spend
          </div>
          <div style={{ fontSize: 13, color: colors.ink3, marginTop: 4 }}>
            Bigger box = more money. Includes savings.
          </div>
        </div>
        <div style={{ fontSize: 12, color: colors.ink3 }}>
          Total flow:{' '}
          <b style={{ color: colors.ink }}>{fmt(totalFlow, props.currency, props.locale)}</b>
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          flex: 1,
          borderRadius: 10,
          overflow: 'hidden',
          background: colors.surface2,
        }}
      >
        {cells.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              color: colors.ink3,
            }}
          >
            No spending logged this month yet.
          </div>
        )}
        {cells.map((c, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${c.x * 0.78}%`,
              top: `${c.y * 0.78}%`,
              width: `${c.w * 0.78}%`,
              height: `${c.h * 0.78}%`,
              padding: 4,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 6,
                background: c.color,
                opacity: 0.85,
                padding: 14,
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                overflow: 'hidden',
              }}
            >
              <div style={{ fontSize: c.big ? 14 : 12, fontWeight: 700, opacity: 0.95 }}>
                {c.label}
              </div>
              <div
                style={{
                  fontFamily: font.display,
                  fontSize: c.big ? 24 : 16,
                  fontWeight: 700,
                  letterSpacing: -0.4,
                }}
              >
                {fmt(c.amt, props.currency, props.locale)}
              </div>
            </div>
          </div>
        ))}
        {/* Saved & invested band */}
        {saved > 0 && (
          <div
            style={{
              position: 'absolute',
              left: '0%',
              top: '78%',
              width: '100%',
              height: '22%',
              padding: 4,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 6,
                background: colors.accent,
                opacity: 0.92,
                padding: 14,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>Saved & invested</div>
              <div
                style={{
                  fontFamily: font.display,
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: -0.4,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmt(saved, props.currency, props.locale)}
              </div>
            </div>
          </div>
        )}
        {/* Right-side margin filler */}
        <div
          style={{
            position: 'absolute',
            left: '78%',
            top: '0',
            width: '22%',
            height: saved > 0 ? '78%' : '100%',
            padding: 4,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 6,
              background: colors.surface,
              border: `0.5px solid ${colors.line}`,
              padding: 14,
              color: colors.ink3,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 11,
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: colors.ink3,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              Quick read
            </div>
            <div>
              <b style={{ color: colors.ink }}>{fmt(expenseTotal, props.currency, props.locale)}</b>{' '}
              spent across {Object.keys(debitsByCat).length} categories.
            </div>
            {saved > 0 && (
              <div>
                <b style={{ color: colors.accent }}>{fmt(saved, props.currency, props.locale)}</b>{' '}
                stayed unspent.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
