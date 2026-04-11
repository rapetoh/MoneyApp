'use client'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts'
import { colors, font, fontSize } from '../lib/theme'
import { formatCurrency } from '@voice-expense/shared'

const BAR_COLORS = [
  colors.primary,
  '#F48C06',
  '#2D6A4F',
  '#457B9D',
  '#6D6875',
]

interface DataPoint {
  name: string
  amount: number
}

interface Props {
  data: DataPoint[]
  currency: string
}

export function CategoryChart({ data, currency }: Props) {
  if (data.length === 0) {
    return (
      <div style={styles.empty}>No expense data yet</div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <XAxis
          type="number"
          tick={{ fontFamily: font.mono, fontSize: fontSize.xs, fill: colors.textSecondary }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCurrency(v, currency)}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={96}
          tick={{ fontFamily: font.sans, fontSize: fontSize.xs, fill: colors.text }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            fontFamily: font.sans,
            fontSize: fontSize.sm,
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
          }}
          formatter={(value) => [formatCurrency(Number(value), currency), 'Spent']}
        />
        <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    height: 220,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
}
