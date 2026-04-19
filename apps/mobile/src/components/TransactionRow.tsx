import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { Transaction } from '@voice-expense/shared'
import { formatCurrency, t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'
import { MerchantAvatar } from './MerchantAvatar'
import { Colors, Typography, Spacing } from '../theme'

interface Props {
  transaction: Transaction
  categoryName?: string | null
  currency: string   // always the profile currency — ensures all rows are consistent
  locale?: Locale
  onPress?: () => void
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function TransactionRow({ transaction, categoryName, currency, locale = 'en', onPress }: Props) {
  const isCredit = transaction.direction === 'credit'
  const amountColor = isCredit ? Colors.income : Colors.text
  const amountPrefix = isCredit ? '+' : '-'

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <MerchantAvatar merchant={transaction.merchant} merchantDomain={transaction.merchant_domain} size={44} />
      <View style={styles.info}>
        <Text style={styles.merchant} numberOfLines={1}>
          {transaction.merchant ?? t('transactions.unknown', locale)}
        </Text>
        {categoryName && (
          <Text style={styles.category} numberOfLines={1}>
            {categoryName}
          </Text>
        )}
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color: amountColor }]}>
          {amountPrefix}
          {formatCurrency(transaction.amount, currency)}
        </Text>
        <Text style={styles.time}>{formatTime(transaction.transacted_at)}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    backgroundColor: Colors.card,
    gap: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  merchant: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  category: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  amount: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: Typography.size.md,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  time: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
})
