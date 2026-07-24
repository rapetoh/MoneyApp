import { colors, font, cat as catTokens } from '../../lib/theme'
import { tintFor } from '../../lib/categories'
import { type LensProps, monthDebits, monthCredits, groupByCategory } from './types'
import { aggAmount } from '@voice-expense/shared'

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

// Two-row treemap with a per-row minimum-width floor so a $20 category
// next to a $20 K one is still readable. Top row gets 80% of the
// canvas height for the bigger items; tail row 20% for the long tail.
// Values returned as percentages of the canvas (0-100) on each axis.
function layoutCells(
  items: Array<{ label: string; amt: number; color: string }>,
): Cell[] {
  if (items.length === 0) return []
  const total = items.reduce((s, i) => s + i.amt, 0)
  if (total <= 0) return []

  const sorted = [...items].sort((a, b) => b.amt - a.amt)
  const TOP_COUNT = 4
  const topItems = sorted.slice(0, TOP_COUNT)
  const tailItems = sorted.slice(TOP_COUNT)

  const cells: Cell[] = []

  function packRow(
    rowItems: typeof topItems,
    yPct: number,
    hPct: number,
    minWPct: number,
  ): void {
    if (rowItems.length === 0) return
    const rowTotal = rowItems.reduce((s, i) => s + i.amt, 0)
    if (rowTotal <= 0) return
    const minSum = minWPct * rowItems.length
    const flexible = Math.max(0, 100 - minSum)
    let xCursor = 0
    for (const it of rowItems) {
      const w = minWPct + (it.amt / rowTotal) * flexible
      cells.push({
        x: xCursor,
        y: yPct,
        w,
        h: hPct,
        label: it.label,
        amt: it.amt,
        color: it.color,
        // "Big" tile gets larger typography; threshold is the share of
        // the canvas the cell occupies, in pct² area.
        big: w * hPct > 1500,
      })
      xCursor += w
    }
  }

  packRow(topItems, 0, tailItems.length > 0 ? 80 : 100, 14)
  if (tailItems.length > 0) packRow(tailItems, 80, 20, 18)

  return cells
}

export function TreemapLens({ props }: { props: LensProps }) {
  const debits = monthDebits(props)
  const credits = monthCredits(props)
  const incomeTotal = credits.reduce((s, t) => s + aggAmount(t), 0)
  const expenseTotal = debits.reduce((s, t) => s + aggAmount(t), 0)
  const saved = Math.max(0, incomeTotal - expenseTotal)

  const debitsByCat = groupByCategory(debits)
  const items = Object.entries(debitsByCat).map(([name, amt]) => ({
    label: name,
    amt,
    color: catTokens[tintFor(name)].fg,
  }))

  const cells = layoutCells(items)
  // Reserve the bottom strip for "Saved & invested" only when the user
  // actually saved this month; otherwise expenses fill the whole
  // canvas. SAVED_BAND_PCT is the height of that strip as a fraction
  // of the canvas (matches the 22% the layoutCells call leaves below
  // y=78 when saved > 0; here we subtract the BAND so saved sits in
  // its own row without colliding with the tail row).
  const showSavedBand = saved > 0
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
        {/* Cells fill the full canvas now — the previous "Quick
            read" sidebar duplicated stats already in the page header
            and visually swallowed ~22% of the chart for nothing.
            When savings exist, the bottom 22% of the canvas is the
            "Saved & invested" band; expenses are scaled into the
            remaining 78%. Without savings, expenses fill the whole
            canvas. */}
        {cells.map((c, i) => {
          const yScale = showSavedBand ? 0.78 : 1
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${c.x}%`,
                top: `${c.y * yScale}%`,
                width: `${c.w}%`,
                height: `${c.h * yScale}%`,
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
          )
        })}
        {showSavedBand && (
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
      </div>
    </div>
  )
}
