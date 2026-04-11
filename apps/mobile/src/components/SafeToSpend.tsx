import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { formatCurrency } from '@voice-expense/shared'
import type { BudgetPeriod } from '@voice-expense/shared'
import { Colors, Typography, Spacing, Radius } from '../theme'

interface Props {
  monthlyBudget: number | null
  totalSpent: number
  upcomingRecurring: number
  currency: string
  period?: BudgetPeriod
}

function periodLabel(period: BudgetPeriod | undefined): string {
  switch (period) {
    case 'weekly': return 'Weekly'
    case 'biweekly': return 'Bi-weekly'
    case 'quarterly': return 'Quarterly'
    case 'yearly': return 'Yearly'
    default: return 'Monthly'
  }
}

function spentLabel(period: BudgetPeriod | undefined): string {
  switch (period) {
    case 'weekly': return 'Spent this week'
    case 'biweekly': return 'Spent (last 14 days)'
    case 'quarterly': return 'Spent this quarter'
    case 'yearly': return 'Spent this year'
    default: return 'Spent this month'
  }
}

export function SafeToSpend({ monthlyBudget, totalSpent, upcomingRecurring, currency, period }: Props) {
  const hasBudget = monthlyBudget !== null && monthlyBudget > 0

  if (!hasBudget) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>{spentLabel(period)}</Text>
        <Text style={styles.amount}>{formatCurrency(totalSpent, currency)}</Text>
        <Text style={styles.hint}>Set a budget to see Safe to Spend</Text>
      </View>
    )
  }

  const committed = totalSpent + upcomingRecurring
  const remaining = Math.max(0, monthlyBudget - committed)
  const isOverBudget = committed > monthlyBudget
  const overBy = committed - monthlyBudget

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Safe to Spend</Text>
      <Text style={[styles.amount, isOverBudget && styles.overBudget]}>
        {isOverBudget ? formatCurrency(0, currency) : formatCurrency(remaining, currency)}
      </Text>
      {isOverBudget && (
        <View style={styles.warningRow}>
          <Text style={styles.warningText}>Over budget by {formatCurrency(overBy, currency)}</Text>
        </View>
      )}
      <View style={styles.breakdown}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{spentLabel(period)}</Text>
          <Text style={styles.breakdownValue}>{formatCurrency(totalSpent, currency)}</Text>
        </View>
        {upcomingRecurring > 0 && (
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Upcoming</Text>
            <Text style={styles.breakdownValue}>{formatCurrency(upcomingRecurring, currency)}</Text>
          </View>
        )}
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{periodLabel(period)} budget</Text>
          <Text style={styles.breakdownValue}>{formatCurrency(monthlyBudget, currency)}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  label: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  amount: {
    fontFamily: Typography.fontFamily.monoBold,
    fontSize: Typography.size['3xl'],
    color: Colors.white,
  },
  overBudget: {
    fontSize: Typography.size['2xl'],
  },
  warningRow: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
  },
  warningText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
  breakdown: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.7)',
  },
  breakdownValue: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.9)',
  },
  hint: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.7)',
  },
})
