// Renders the optional `chart` payload Murmur attaches to an answer. Four
// shapes — bar, line, donut, horizontal_bar — chosen to fit the kinds of
// stories the reasoner actually tells over a transaction history. Pure SVG;
// no recharts dependency to keep the bundle clean.
import type { AskMurmurChart } from '@voice-expense/shared'
import { cat as catTints, colors, font } from '../lib/theme'
import { tintFor } from '../lib/categories'

const PALETTE: string[] = [
  catTints.food.fg,
  catTints.transit.fg,
  catTints.shopping.fg,
  catTints.bills.fg,
  catTints.coffee.fg,
  catTints.health.fg,
  catTints.work.fg,
  catTints.other.fg,
]

function colorFor(label: string, fallbackIdx: number): string {
  // Prefer a category-aware tint when the label looks like one of our category
  // names; else cycle through the palette so neighboring slices/bars don't
  // collide.
  const tint = tintFor(label)
  if (tint !== 'other') return catTints[tint].fg
  return PALETTE[fallbackIdx % PALETTE.length]
}

export function AskChart({
  chart,
  currency,
  locale,
}: {
  chart: AskMurmurChart
  currency: string
  locale: string
}) {
  const fmt = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: v < 100 ? 2 : 0,
    }).format(v)

  return (
    <div style={styles.wrap}>
      <div style={styles.title}>{chart.title}</div>
      {chart.type === 'donut' && <Donut data={chart.data} fmt={fmt} />}
      {chart.type === 'bar' && <Bars data={chart.data} fmt={fmt} />}
      {chart.type === 'horizontal_bar' && <HBars data={chart.data} fmt={fmt} />}
      {chart.type === 'line' && <LineChart data={chart.data} fmt={fmt} />}
      {chart.caption && <div style={styles.caption}>{chart.caption}</div>}
    </div>
  )
}

function Donut({
  data,
  fmt,
}: {
  data: AskMurmurChart['data']
  fmt: (n: number) => string
}) {
  const total = data.reduce((s, p) => s + p.value, 0)
  if (total <= 0) return null
  const r = 64
  const C = 2 * Math.PI * r
  let off = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke={colors.surface2} strokeWidth="18" />
        {data.map((p, i) => {
          const len = (p.value / total) * C
          const el = (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={colorFor(p.label, i)}
              strokeWidth="18"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-off}
              transform="rotate(-90 80 80)"
            />
          )
          off += len + 2
          return el
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="10" fill={colors.ink3} fontWeight="600">
          Total
        </text>
        <text
          x="80"
          y="96"
          textAnchor="middle"
          fontSize="16"
          fill={colors.ink}
          fontWeight="700"
          fontFamily={font.serif}
        >
          {fmt(total)}
        </text>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        {data.map((p, i) => {
          const pct = (p.value / total) * 100
          return (
            <div key={i} style={styles.legendRow}>
              <span style={{ ...styles.swatch, background: colorFor(p.label, i) }} />
              <span style={styles.legendLabel}>{p.label}</span>
              <span style={styles.legendValue}>{Math.round(pct)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Bars({
  data,
  fmt,
}: {
  data: AskMurmurChart['data']
  fmt: (n: number) => string
}) {
  const max = Math.max(...data.map((p) => p.value), 1)
  const w = 560
  const h = 180
  const pad = 28
  const barW = (w - pad * 2) / data.length
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h + 28}`} style={{ width: '100%', height: 200 }}>
        {[0, 1, 2, 3].map((i) => {
          const gy = pad + i * ((h - pad * 2) / 3)
          return (
            <line
              key={i}
              x1={pad}
              x2={w - pad}
              y1={gy}
              y2={gy}
              stroke={colors.line}
              strokeDasharray="2 3"
            />
          )
        })}
        {data.map((p, i) => {
          const barH = (p.value / max) * (h - pad * 2)
          const x = pad + i * barW + barW * 0.18
          const y = h - pad - barH
          const width = barW * 0.64
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={width}
                height={Math.max(barH, 2)}
                rx={4}
                fill={colorFor(p.label, i)}
                opacity={0.92}
              />
              <text
                x={x + width / 2}
                y={h + 14}
                fontSize="10"
                fill={colors.ink3}
                textAnchor="middle"
                fontWeight="600"
              >
                {p.label}
              </text>
            </g>
          )
        })}
      </svg>
      <ValueRow data={data} fmt={fmt} />
    </div>
  )
}

function HBars({
  data,
  fmt,
}: {
  data: AskMurmurChart['data']
  fmt: (n: number) => string
}) {
  const max = Math.max(...data.map((p) => p.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <div
            style={{
              width: 96,
              color: colors.ink2,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: font.sans,
            }}
          >
            {p.label}
          </div>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              background: colors.surface2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(p.value / max) * 100}%`,
                height: '100%',
                background: colorFor(p.label, i),
                opacity: 0.9,
                borderRadius: 4,
              }}
            />
          </div>
          <div
            style={{
              width: 80,
              textAlign: 'right',
              color: colors.ink,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: font.sans,
            }}
          >
            {fmt(p.value)}
          </div>
        </div>
      ))}
    </div>
  )
}

function LineChart({
  data,
  fmt,
}: {
  data: AskMurmurChart['data']
  fmt: (n: number) => string
}) {
  const w = 560
  const h = 180
  const pad = 32
  const max = Math.max(...data.map((p) => p.value), 1) * 1.1
  const x = (i: number) => pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2)
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2)
  const linePath = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ')
  const areaPath =
    data.length > 1
      ? `${linePath} L ${x(data.length - 1).toFixed(1)},${h - pad} L ${pad},${h - pad} Z`
      : ''

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h + 24}`} style={{ width: '100%', height: 200 }}>
        <defs>
          <linearGradient id="askLineGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colors.accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const gy = pad + i * ((h - pad * 2) / 3)
          return (
            <line
              key={i}
              x1={pad}
              x2={w - pad}
              y1={gy}
              y2={gy}
              stroke={colors.line}
              strokeDasharray="2 3"
            />
          )
        })}
        {areaPath && <path d={areaPath} fill="url(#askLineGrad)" />}
        {data.length > 1 && (
          <path d={linePath} fill="none" stroke={colors.accent} strokeWidth="2.5" />
        )}
        {data.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r="3.5" fill="#fff" stroke={colors.accent} strokeWidth="2" />
            <text x={x(i)} y={h + 14} fontSize="10" fill={colors.ink3} textAnchor="middle" fontWeight="600">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <div style={styles.lineSummary}>
        <span style={styles.legendLabel}>{data[0]?.label}</span>
        <span style={styles.legendValue}>{fmt(data[0]?.value ?? 0)}</span>
        <span style={{ color: colors.ink4, fontSize: 12, margin: '0 6px' }}>{'→'}</span>
        <span style={styles.legendLabel}>{data[data.length - 1]?.label}</span>
        <span style={styles.legendValue}>{fmt(data[data.length - 1]?.value ?? 0)}</span>
      </div>
    </div>
  )
}

function ValueRow({
  data,
  fmt,
}: {
  data: AskMurmurChart['data']
  fmt: (n: number) => string
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${data.length}, 1fr)`,
        gap: 4,
        marginTop: 6,
      }}
    >
      {data.map((p, i) => (
        <div
          key={i}
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: colors.ink3,
            fontFamily: font.sans,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmt(p.value)}
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    background: colors.card,
    border: `0.5px solid ${colors.line}`,
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  title: {
    fontFamily: font.sans,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  caption: {
    fontFamily: font.sans,
    fontSize: 12,
    color: colors.ink3,
    lineHeight: 1.45,
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    fontFamily: font.sans,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    flexShrink: 0,
  },
  legendLabel: {
    flex: 1,
    color: colors.ink2,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  legendValue: {
    color: colors.ink,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  lineSummary: {
    marginTop: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: colors.ink3,
    fontFamily: font.sans,
  },
}
