import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { formatCurrency, t } from '@voice-expense/shared'
import type { BudgetPeriod, Locale } from '@voice-expense/shared'
import { Colors, Typography, Spacing, Radius } from '../theme'

interface Props {
  monthlyBudget: number | null
  totalSpent: number
  upcomingRecurring: number
  currency: string
  period?: BudgetPeriod
  locale?: Locale
}

function spentKey(period: BudgetPeriod | undefined): string {
  switch (period) {
    case 'weekly': return 'home.spent_weekly'
    case 'biweekly': return 'home.spent_biweekly'
    case 'quarterly': return 'home.spent_quarterly'
    case 'yearly': return 'home.spent_yearly'
    default: return 'home.spent_monthly'
  }
}

function budgetKey(period: BudgetPeriod | undefined): string {
  switch (period) {
    case 'weekly': return 'home.budget_weekly'
    case 'biweekly': return 'home.budget_biweekly'
    case 'quarterly': return 'home.budget_quarterly'
    case 'yearly': return 'home.budget_yearly'
    default: return 'home.budget_monthly'
  }
}

export function SafeToSpend({ monthlyBudget, totalSpent, upcomingRecurring, currency, period, locale = 'en' }: Props) {
  const hasBudget = monthlyBudget !== null && monthlyBudget > 0

  if (!hasBudget) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>{t(spentKey(period), locale)}</Text>
        <Text style={styles.amount}>{formatCurrency(totalSpent, currency)}</Text>
        <Text style={styles.hint}>{t('home.set_budget', locale)}</Text>
      </View>
    )
  }

  const committed = totalSpent + upcomingRecurring
  const remaining = Math.max(0, monthlyBudget - committed)
  const isOverBudget = committed > monthlyBudget
  const overBy = committed - monthlyBudget

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t('home.safe_to_spend', locale)}</Text>
      <Text style={[styles.amount, isOverBudget && styles.overBudget]}>
        {isOverBudget ? formatCurrency(0, currency) : formatCurrency(remaining, currency)}
      </Text>
      {isOverBudget && (
        <View style={styles.warningRow}>
          <Text style={styles.warningText}>{t('home.over_budget', locale)} {formatCurrency(overBy, currency)}</Text>
        </View>
      )}
      <View style={styles.breakdown}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{t(spentKey(period), locale)}</Text>
          <Text style={styles.breakdownValue}>{formatCurrency(totalSpent, currency)}</Text>
        </View>
        {upcomingRecurring > 0 && (
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>{t('home.upcoming', locale)}</Text>
            <Text style={styles.breakdownValue}>{formatCurrency(upcomingRecurring, currency)}</Text>
          </View>
        )}
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{t(budgetKey(period), locale)}</Text>
          <Text style={styles.breakdownValue}>{formatCurrency(monthlyBudget, currency)}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.card,
    padding: Spacing.xl,
    gap: Spacing.sm,
    shadowColor: '#1B1915',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  label: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  amount: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: Typography.size['4xl'],
    fontWeight: '600',
    letterSpacing: -0.6,
    color: Colors.white,
  },
  overBudget: {
    fontSize: Typography.size['3xl'],
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
    fontFamily: Typography.fontFamily.serif,
    fontSize: Typography.size.base,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  hint: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.7)',
  },
})
