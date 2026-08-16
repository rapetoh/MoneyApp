'use client'
// Monthly total · forecast chart (Insights). Client component so it can
// measure its real width (Aug 16, 2026 owner review): the previous
// server-rendered version drew into a fixed 1120-unit viewBox with
// `width: 100%`, so on any window wider than ~1150px the SVG was
// letterboxed — the plot floated centred with blank card on both sides
// and the y-axis labels sat mid-card — and it lived inside a card with a
// hard `height: 360` that its own content (header + 280px SVG) did not
// fit in, so the month labels along the x-axis rendered *below* the
// card's bottom edge. The x-scale now uses the measured container width
// (text stays 10px at any width) and the card sizes to content.
import { useLayoutEffect, useRef, useState } from 'react'
import { colors } from '../lib/theme'

const H = 260 // plot height in px
const AXIS_H = 24 // room under the plot for the month labels
const PAD = 44 // left/right inset; also clears the y-axis labels at x=0
const FALLBACK_W = 1120 // SSR / first paint before measurement

export function ForecastChart({
  history,
  forecast,
  budget,
  labels,
  currency,
  locale,
}: {
  history: number[]
  forecast: Array<number | null>
  budget: number | null
  labels: string[]
  currency: string
  locale: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [w, setW] = useState(FALLBACK_W)

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => {
      const width = el.getBoundingClientRect().width
      if (width > 0) setW(Math.round(width))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      v,
    )
  const all = [...history, ...forecast.filter((x): x is number => x != null), budget ?? 0]
  const max = Math.max(...all, 1) * 1.1
  const x = (i: number) => PAD + (i / Math.max(labels.length - 1, 1)) * (w - PAD * 2)
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2)

  const histPts = history.map((v, i) => [x(i), y(v)] as const)
  const histLine = histPts.length
    ? `M ${histPts[0][0]},${histPts[0][1]} ` +
      histPts
        .slice(1)
        .map((p) => `L ${p[0]},${p[1]}`)
        .join(' ')
    : ''
  const histArea = histPts.length
    ? `${histLine} L ${histPts[histPts.length - 1][0]},${H - PAD} L ${histPts[0][0]},${H - PAD} Z`
    : ''

  const forecastPts = forecast
    .map((v, i) => (v == null ? null : ([x(i), y(v)] as const)))
    .filter((p): p is readonly [number, number] => p != null)
  const forecastLine = forecastPts.length
    ? `M ${forecastPts[0][0]},${forecastPts[0][1]} ` +
      forecastPts
        .slice(1)
        .map((p) => `L ${p[0]},${p[1]}`)
        .join(' ')
    : ''

  return (
    <div ref={hostRef} style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${w} ${H + AXIS_H}`}
        width={w}
        height={H + AXIS_H}
        style={{ display: 'block', width: '100%', height: H + AXIS_H, overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="gActual" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colors.accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => {
          const gy = PAD + i * ((H - PAD * 2) / 4)
          const val = max - (i * max) / 4
          return (
            <g key={i}>
              <line
                x1={PAD}
                x2={w - PAD}
                y1={gy}
                y2={gy}
                stroke={colors.line}
                strokeDasharray="2 3"
              />
              <text x={0} y={gy + 4} fontSize="10" fill={colors.ink4} fontWeight="600">
                {fmt(val)}
              </text>
            </g>
          )
        })}
        {budget != null && (
          <>
            <line
              x1={PAD}
              x2={w - PAD}
              y1={y(budget)}
              y2={y(budget)}
              stroke={colors.ink4}
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <text
              x={w - PAD - 6}
              y={y(budget) - 6}
              fontSize="10"
              fill={colors.ink3}
              textAnchor="end"
              fontWeight="700"
            >
              Budget {fmt(budget)}
            </text>
          </>
        )}
        {histArea && <path d={histArea} fill="url(#gActual)" />}
        {histLine && <path d={histLine} fill="none" stroke={colors.accent} strokeWidth="2.5" />}
        {forecastLine && (
          <path
            d={forecastLine}
            fill="none"
            stroke="#7A5A1C"
            strokeWidth="2.5"
            strokeDasharray="5 4"
            opacity="0.7"
          />
        )}
        {histPts.map(([px, py], i) => (
          <circle
            key={i}
            cx={px}
            cy={py}
            r="4"
            fill="#fff"
            stroke={colors.accent}
            strokeWidth="2"
          />
        ))}
        {labels.map((d, i) => (
          <text
            key={i}
            x={x(i)}
            y={H + 14}
            fontSize="10"
            fill={i < history.length ? colors.ink3 : colors.ink4}
            textAnchor="middle"
            fontWeight={i === history.length - 1 ? '700' : '600'}
          >
            {d}
          </text>
        ))}
      </svg>
    </div>
  )
}
