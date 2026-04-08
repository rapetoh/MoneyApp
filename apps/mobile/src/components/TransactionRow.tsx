import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { Transaction } from '@voice-expense/shared'
import { formatAmount } from '@voice-expense/shared'
import { MerchantAvatar } from './MerchantAvatar'
import { Colors, Typography, Spacing } from '../theme'

interface Props {
  transaction: Transaction
  categoryName?: string | null
  onPress?: () => void
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function TransactionRow({ transaction, categoryName, onPress }: Props) {
  const isCredit = transaction.direction === 'credit'
  const amountColor = isCredit ? Colors.income : Colors.text
  const amountPrefix = isCredit ? '+' : '-'

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <MerchantAvatar merchant={transaction.merchant} size={44} />
      <View style={styles.info}>
        <Text style={styles.merchant} numberOfLines={1}>
          {transaction.merchant ?? 'Unknown'}
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
          {formatAmount(transaction.amount, transaction.currency_code)}
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
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.size.base,
  },
  time: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
})
