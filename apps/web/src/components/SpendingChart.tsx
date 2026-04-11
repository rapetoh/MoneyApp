'use client'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { colors, font, fontSize } from '../lib/theme'
import { formatCurrency } from '@voice-expense/shared'

interface DataPoint {
  label: string
  expenses: number
  income: number
}

interface Props {
  data: DataPoint[]
  currency: string
}

export function SpendingChart({ data, currency }: Props) {
  if (data.length === 0) {
    return (
      <div style={styles.empty}>No transaction data yet</div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.primary} stopOpacity={0.15} />
            <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.income} stopOpacity={0.15} />
            <stop offset="95%" stopColor={colors.income} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontFamily: font.sans, fontSize: fontSize.xs, fill: colors.textSecondary }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontFamily: font.mono, fontSize: fontSize.xs, fill: colors.textSecondary }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCurrency(v, currency)}
          width={72}
        />
        <Tooltip
          contentStyle={{
            fontFamily: font.sans,
            fontSize: fontSize.sm,
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
          }}
          formatter={(value, name) => [
            formatCurrency(Number(value), currency),
            name === 'expenses' ? 'Expenses' : 'Income',
          ]}
        />
        <Area
          type="monotone"
          dataKey="expenses"
          stroke={colors.primary}
          strokeWidth={2}
          fill="url(#expenseGrad)"
        />
        <Area
          type="monotone"
          dataKey="income"
          stroke={colors.income}
          strokeWidth={2}
          fill="url(#incomeGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    height: 240,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
}
