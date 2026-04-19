import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { Transaction } from '@voice-expense/shared'
import { t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'
import { MerchantAvatar } from './MerchantAvatar'
import { Money } from './Money'
import { Colors, Typography, Hairline } from '../theme'

interface Props {
  transaction: Transaction
  categoryName?: string | null
  /** Color for the category chip (defaults to ink3 when absent). Accepts hex. */
  categoryColor?: string | null
  currency: string
  locale?: Locale
  /** If true, renders a hairline divider above the row (matches the stacked list style in Today). */
  showDivider?: boolean
  onPress?: () => void
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * Row reproduced from `TxRow` in docs/money-app/project/mobile-screens-1.jsx.
 *
 *   - 40×40 merchant logo with 12px radius.
 *   - Voice-logged rows show a small sage mic glyph next to the merchant name.
 *   - Recurring rows show a repeat glyph in ink4.
 *   - Amount on the right is SANS-bold at 16px via `<Money serif={false}/>`.
 *     Serif is reserved for hero amounts.
 *   - Meta line: small category chip (category color, low-alpha bg) · time.
 *
 * Keeps using MerchantAvatar — the merchant logo pipeline is a product-defining
 * non-regression the user flagged on 2026-04-18.
 */
export function TransactionRow({
  transaction,
  categoryName,
  categoryColor,
  currency,
  locale = 'en',
  showDivider = false,
  onPress,
}: Props) {
  const isCredit = transaction.direction === 'credit'
  const isVoice = transaction.source === 'voice'
  const isRecurring = transaction.is_recurring === true
  const sign = isCredit ? 1 : -1
  const amountColor = isCredit ? Colors.income : Colors.ink ?? Colors.text
  const chipColor = categoryColor ?? Colors.ink3 ?? Colors.textSecondary

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {showDivider && <View style={styles.divider} />}
      <View style={styles.row}>
        <MerchantAvatar
          merchant={transaction.merchant}
          merchantDomain={transaction.merchant_domain}
          size={40}
          radius={12}
        />
        <View style={styles.info}>
          <View style={styles.topLine}>
            <Text style={styles.merchant} numberOfLines={1}>
              {transaction.merchant ?? t('transactions.unknown', locale)}
            </Text>
            {isVoice && (
              <Ionicons
                name="mic"
                size={11}
                color={Colors.accent ?? Colors.primary}
                style={styles.glyph}
              />
            )}
            {isRecurring && (
              <Ionicons
                name="repeat"
                size={12}
                color={Colors.ink4 ?? Colors.textMuted}
                style={styles.glyph}
              />
            )}
          </View>
          <View style={styles.metaLine}>
            {categoryName ? (
              <View style={[styles.chip, { backgroundColor: chipColor + '22' }]}>
                <Text style={[styles.chipLabel, { color: chipColor }]} numberOfLines={1}>
                  {categoryName}
                </Text>
              </View>
            ) : null}
            {categoryName ? <Text style={styles.metaDot}>·</Text> : null}
            <Text style={styles.metaTime}>{formatTime(transaction.transacted_at)}</Text>
          </View>
        </View>
        <Money
          value={sign * transaction.amount}
          size={16}
          serif={false}
          sansWeight="700"
          color={amountColor}
          sign={currencySymbolFor(currency)}
        />
      </View>
    </Pressable>
  )
}

function currencySymbolFor(code: string): string {
  switch (code) {
    case 'USD':
    case 'CAD':
    case 'AUD':
      return '$'
    case 'EUR':
      return '€'
    case 'GBP':
      return '£'
    case 'JPY':
      return '¥'
    case 'CHF':
      return 'CHF '
    case 'NGN':
      return '₦'
    case 'GHS':
      return '₵'
    case 'XAF':
      return 'CFA '
    default:
      return code + ' '
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  pressed: { opacity: 0.7 },
  divider: {
    height: Hairline.width,
    backgroundColor: Hairline.color,
    marginLeft: 14 + 40 + 12, // row-padding + avatar-size + gap
  },
  info: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  merchant: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: Colors.ink ?? Colors.text,
    flexShrink: 1,
  },
  glyph: { marginTop: 1 },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: 140,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    letterSpacing: 0.1,
  },
  metaDot: {
    fontSize: 12,
    color: Colors.ink4 ?? Colors.textMuted,
  },
  metaTime: {
    fontSize: 12,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sans,
  },
})
