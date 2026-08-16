import { useMemo, useState } from 'react'
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native'
import Svg, { Rect, Path, Circle, Line as SvgLine } from 'react-native-svg'
import { formatMoney } from '@voice-expense/shared'
import type { AskMurmurChart, AskMurmurChartPoint } from '@voice-expense/shared'
import { Colors, Typography, Hairline } from '../theme'

interface Props {
  chart: AskMurmurChart
  currency: string
  locale: string
}

// One hue for magnitude (sage, light→dark), ink for text — never a series
// colour on a label. Identity in the donut comes from the direct labels
// beside each slice, not from a rainbow (see the dataviz method: single-hue
// marks, text wears text tokens, legend/labels never colour-alone).
const SAGE_STEPS = ['#3F5A3E', '#5E7A5C', '#7E9A7B', '#9EB69B', '#BFD0BC', '#DCE6DA']
const MAX_POINTS = 10

/**
 * Renders the reasoner's optional chart inside the Murmur bubble — the same
 * four shapes the web thread already draws (apps/web/src/components/
 * AskChart.tsx), on react-native-svg. Mobile silently dropped `chart`
 * before this (build 14), which is a large part of why answers felt flat
 * next to Cash App's.
 */
export function AskChart({ chart, currency, locale }: Props) {
  const [width, setWidth] = useState(0)
  const data = useMemo(() => chart.data.filter((p) => Number.isFinite(p.value)).slice(0, MAX_POINTS), [chart.data])
  const fmt = (v: number) => formatMoney(v, currency, locale, { precision: 'compact' })

  if (data.length < 2) return null

  return (
    <View style={styles.card} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <Text style={styles.title}>{chart.title}</Text>
      {width > 0 && (
        <>
          {chart.type === 'bar' && <Bars data={data} width={width - 32} fmt={fmt} />}
          {chart.type === 'line' && <LineChart data={data} width={width - 32} fmt={fmt} />}
          {chart.type === 'horizontal_bar' && <HBars data={data} width={width - 32} fmt={fmt} />}
          {chart.type === 'donut' && <Donut data={data} width={width - 32} fmt={fmt} />}
        </>
      )}
      {chart.caption ? <Text style={styles.caption}>{chart.caption}</Text> : null}
    </View>
  )
}

// ── Vertical bars — time buckets ─────────────────────────────────────────────
function Bars({ data, width, fmt }: { data: AskMurmurChartPoint[]; width: number; fmt: (v: number) => string }) {
  const H = 132
  const labelH = 18
  const valueH = 16
  const plotH = H - labelH - valueH
  const max = Math.max(...data.map((d) => d.value), 0) || 1
  const gap = 8
  const barW = Math.max(6, (width - gap * (data.length - 1)) / data.length)
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0)
  return (
    <View>
      <Svg width={width} height={H}>
        <SvgLine x1={0} y1={valueH + plotH} x2={width} y2={valueH + plotH} stroke={Hairline.color} strokeWidth={1} />
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * plotH)
          const x = i * (barW + gap)
          const y = valueH + plotH - h
          return <Rect key={i} x={x} y={y} width={barW} height={h} rx={3} fill={i === maxIdx ? SAGE_STEPS[0] : SAGE_STEPS[2]} />
        })}
      </Svg>
      {/* Selective direct label: only the peak, in ink. */}
      <View style={[styles.peakLabelWrap, { left: maxIdx * (barW + gap), width: barW }]} pointerEvents="none">
        <Text style={styles.peakLabel} numberOfLines={1}>{fmt(data[maxIdx].value)}</Text>
      </View>
      <View style={styles.xLabels}>
        {data.map((d, i) => (
          <Text key={i} style={[styles.xLabel, { width: barW, marginRight: i < data.length - 1 ? gap : 0 }]} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  )
}

// ── Line — trend ─────────────────────────────────────────────────────────────
function LineChart({ data, width, fmt }: { data: AskMurmurChartPoint[]; width: number; fmt: (v: number) => string }) {
  const H = 132
  const labelH = 18
  const pad = 10
  const plotH = H - labelH - pad
  const max = Math.max(...data.map((d) => d.value), 0) || 1
  const min = Math.min(...data.map((d) => d.value), 0)
  const range = max - min || 1
  const step = data.length > 1 ? (width - 8) / (data.length - 1) : 0
  const pts = data.map((d, i) => ({ x: 4 + i * step, y: pad + plotH - ((d.value - min) / range) * plotH }))
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <View>
      <Svg width={width} height={H}>
        <SvgLine x1={0} y1={pad + plotH} x2={width} y2={pad + plotH} stroke={Hairline.color} strokeWidth={1} />
        <Path d={path} stroke={SAGE_STEPS[0]} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 4.5 : 3} fill={SAGE_STEPS[0]} stroke="#FFFFFF" strokeWidth={2} />
        ))}
      </Svg>
      <View style={[styles.peakLabelWrap, { left: Math.min(Math.max(last.x - 30, 0), width - 60), width: 60, top: Math.max(last.y - 24, 0) }]} pointerEvents="none">
        <Text style={styles.peakLabel} numberOfLines={1}>{fmt(data[data.length - 1].value)}</Text>
      </View>
      <View style={styles.xLabelsSpread}>
        <Text style={styles.xLabel} numberOfLines={1}>{data[0].label}</Text>
        {data.length > 2 && <Text style={styles.xLabel} numberOfLines={1}>{data[Math.floor(data.length / 2)].label}</Text>}
        <Text style={[styles.xLabel, { textAlign: 'right' }]} numberOfLines={1}>{data[data.length - 1].label}</Text>
      </View>
    </View>
  )
}

// ── Horizontal bars — ranked list ────────────────────────────────────────────
function HBars({ data, width, fmt }: { data: AskMurmurChartPoint[]; width: number; fmt: (v: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 0) || 1
  const labelW = Math.min(120, Math.round(width * 0.38))
  const valueW = 64
  const barMax = Math.max(20, width - labelW - valueW - 16)
  return (
    <View style={{ gap: 8 }}>
      {data.map((d, i) => (
        <View key={i} style={styles.hRow}>
          <Text style={[styles.hLabel, { width: labelW }]} numberOfLines={1}>{d.label}</Text>
          <View style={{ width: barMax }}>
            <View style={[styles.hBar, { width: Math.max(4, (d.value / max) * barMax), backgroundColor: i === 0 ? SAGE_STEPS[0] : SAGE_STEPS[2] }]} />
          </View>
          <Text style={[styles.hValue, { width: valueW }]} numberOfLines={1}>{fmt(d.value)}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Donut — share of total, ≤ 6 slices ───────────────────────────────────────
function Donut({ data, width, fmt }: { data: AskMurmurChartPoint[]; width: number; fmt: (v: number) => string }) {
  const slices = data.slice(0, 6)
  const total = slices.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1
  const size = Math.min(132, width * 0.42)
  const r = size / 2 - 4
  const cx = size / 2
  const cy = size / 2
  const stroke = 16
  let angle = -Math.PI / 2
  const arcs = slices.map((d, i) => {
    const frac = Math.max(d.value, 0) / total
    const start = angle
    const end = angle + frac * Math.PI * 2 - 0.035 // 2px-ish surface gap between slices
    angle += frac * Math.PI * 2
    return { i, start, end: Math.max(end, start), frac }
  })
  const arcPath = (start: number, end: number) => {
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end)
    const large = end - start > Math.PI ? 1 : 0
    return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}`
  }
  return (
    <View style={styles.donutRow}>
      <Svg width={size} height={size}>
        {arcs.map((a) => (
          <Path key={a.i} d={arcPath(a.start, a.end)} stroke={SAGE_STEPS[a.i]} strokeWidth={stroke} fill="none" strokeLinecap="butt" />
        ))}
      </Svg>
      <View style={styles.legend}>
        {slices.map((d, i) => (
          <View key={i} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: SAGE_STEPS[i] }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>{d.label}</Text>
            <Text style={styles.legendValue} numberOfLines={1}>{fmt(d.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    padding: 16,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink3,
    fontFamily: Typography.fontFamily.sansBold,
    marginBottom: 12,
  },
  caption: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.ink3,
    fontFamily: Typography.fontFamily.sans,
  },
  peakLabelWrap: { position: 'absolute', top: 0, alignItems: 'center' },
  peakLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.ink,
    fontFamily: Typography.fontFamily.sansBold,
    fontVariant: ['tabular-nums'],
  },
  xLabels: { flexDirection: 'row', marginTop: 4 },
  xLabelsSpread: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  xLabel: {
    fontSize: 10.5,
    color: Colors.ink4,
    textAlign: 'center',
    fontFamily: Typography.fontFamily.sans,
  },
  hRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hLabel: { fontSize: 13, color: Colors.ink2, fontFamily: Typography.fontFamily.sans },
  hBar: { height: 10, borderRadius: 4 },
  hValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.ink,
    textAlign: 'right',
    fontFamily: Typography.fontFamily.sansBold,
    fontVariant: ['tabular-nums'],
  },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 12.5, color: Colors.ink2, fontFamily: Typography.fontFamily.sans },
  legendValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.ink,
    fontFamily: Typography.fontFamily.sansBold,
    fontVariant: ['tabular-nums'],
  },
})
