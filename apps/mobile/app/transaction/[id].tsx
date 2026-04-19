import { useEffect, useState, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useCategories } from '../../src/hooks/useCategories'
import { useUndo } from '../../src/hooks/useUndo'
import {
  getTransactionById,
  softDeleteTransaction,
  upsertTransaction,
} from '../../src/services/sync/transactionStore'
import { enqueue } from '../../src/services/sync/syncQueue'
import { syncManager } from '../../src/services/sync/SyncManager'
import { DataEvents } from '../../src/events/dataEvents'
import { MerchantAvatar } from '../../src/components/MerchantAvatar'
import { Money } from '../../src/components/Money'
import { Colors, Typography, Hairline } from '../../src/theme'
import { formatCurrency, t } from '@voice-expense/shared'
import type { Transaction, Locale } from '@voice-expense/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components (match mockup: DetailRow + ActionBtn shapes)
// ─────────────────────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  last,
}: {
  label: string
  value: string | null
  last?: boolean
}) {
  if (!value) return null
  return (
    <View style={[styles.detailRow, !last && styles.detailRowDivider]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

function ActionBtn({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  onPress?: () => void
  danger?: boolean
}) {
  const color = danger ? (Colors.destructive ?? '#A94646') : (Colors.ink ?? Colors.text)
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}

// Circular pill used for the top-left back + top-right dots buttons.
function HeaderPill({
  onPress,
  children,
}: {
  onPress?: () => void
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.headerPill, pressed && styles.headerPillPressed]}
      hitSlop={8}
    >
      {children}
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen — matches S_Detail in docs/money-app/project/mobile-screens-3.jsx
// ─────────────────────────────────────────────────────────────────────────────

function humanSource(source: string | null | undefined, locale: Locale): string | null {
  if (!source) return null
  switch (source) {
    case 'voice': return t('source.voice', locale)
    case 'manual': return t('source.manual', locale)
    case 'scan': return t('source.scan', locale)
    case 'shortcut': return t('source.shortcut', locale)
    case 'notification_listener': return t('source.notification', locale)
    case 'recurring_generated': return t('source.recurring', locale)
    default: return source
  }
}

function humanPayment(method: string | null | undefined, locale: Locale): string | null {
  if (!method) return null
  switch (method) {
    case 'cash': return t('payment.cash', locale)
    case 'credit_card': return t('payment.credit_card', locale)
    case 'debit_card': return t('payment.debit_card', locale)
    case 'digital_wallet': return t('payment.digital_wallet', locale)
    case 'bank_transfer': return t('payment.bank_transfer', locale)
    default: return method.replace('_', ' ')
  }
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { categoryMap } = useCategories(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const [txn, setTxn] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(true)
  const { showUndo } = useUndo()

  const loadTxn = useCallback(async () => {
    if (!id) return
    const data = await getTransactionById(id)
    if (data) setTxn(data)
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadTxn()
  }, [loadTxn])

  useEffect(() => {
    if (!user?.id) return
    return DataEvents.onTransactions(user.id, loadTxn)
  }, [user?.id, loadTxn])

  async function handleDelete() {
    if (!txn) return
    const snapshot = txn
    const merchantLabel = snapshot.merchant ?? t('transactions.unknown', locale)
    const formatted = formatCurrency(snapshot.amount, currency)

    const deletedVersion = (snapshot.version ?? 1) + 1
    await softDeleteTransaction(snapshot.id)
    await enqueue('delete', snapshot.id, {
      id: snapshot.id,
      user_id: snapshot.user_id,
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      version: deletedVersion,
    })
    syncManager.drainQueue()
    DataEvents.emitTransactions(snapshot.user_id)
    router.back()

    showUndo({
      message: `${t('detail.deleted', locale)} · ${merchantLabel} ${formatted}`,
      undoLabel: t('common.undo', locale),
      undo: async () => {
        const restored: Transaction = {
          ...snapshot,
          is_deleted: false,
          deleted_at: null,
          version: deletedVersion + 1,
          updated_at: new Date().toISOString(),
        }
        await upsertTransaction(restored)
        await enqueue('update', restored.id, restored)
        syncManager.drainQueue()
        DataEvents.emitTransactions(restored.user_id)
      },
    })
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </>
    )
  }

  if (!txn) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('detail.not_found', locale)}</Text>
        </View>
      </>
    )
  }

  const isCredit = txn.direction === 'credit'
  const amountSign = isCredit ? 1 : -1
  const category = txn.category_id ? categoryMap[txn.category_id] : null
  const categoryName = category?.name ?? null
  const categoryColor = category?.color ?? Colors.ink3 ?? Colors.textSecondary

  const dateLine = new Date(txn.transacted_at).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }) + ' · ' + new Date(txn.transacted_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <>
      {/* Hide the native Stack header — the mockup draws its own back + menu-dots pills. */}
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Top bar: back pill only. The mockup's right-side dots menu was a
              no-op placeholder — removed per user feedback. Actions (Edit,
              Delete) live in the button row below the fields. */}
          <View style={styles.topRow}>
            <HeaderPill onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color={Colors.ink2 ?? Colors.textSecondary} />
            </HeaderPill>
          </View>

          {/* Hero */}
          <View style={styles.hero}>
            <MerchantAvatar
              merchant={txn.merchant}
              merchantDomain={txn.merchant_domain}
              size={64}
            />
            <Text style={styles.merchantName}>{txn.merchant ?? t('transactions.unknown', locale)}</Text>
            <View style={styles.heroAmount}>
              <Money
                value={amountSign * txn.amount}
                size={56}
                color={isCredit ? Colors.income : Colors.ink ?? Colors.text}
              />
            </View>
            {categoryName && (
              <View style={[styles.categoryChip, { backgroundColor: categoryColor + '22' }]}>
                <Text style={[styles.categoryChipLabel, { color: categoryColor }]}>
                  {categoryName}
                </Text>
              </View>
            )}
          </View>

          {/* Fields */}
          <View style={styles.fieldsCard}>
            <DetailRow label={t('detail.date', locale)} value={dateLine} />
            <DetailRow label={t('detail.payment', locale)} value={humanPayment(txn.payment_method, locale)} />
            <DetailRow label={t('detail.note', locale)} value={txn.note} />
            <DetailRow label={t('detail.logged_via', locale)} value={humanSource(txn.source, locale)} last />
          </View>

          {/* Actions row — Edit + Delete. Split / Re-record from the mockup
               aren't implemented yet; adding them would introduce new
               functionality rather than match the design. Keeping the
               two-button row in the same shape as the mockup's ActionBtn. */}
          <View style={styles.actionsRow}>
            <ActionBtn
              icon="create-outline"
              label={t('detail.edit', locale)}
              onPress={() => router.push({ pathname: '/transaction/edit', params: { id: txn.id } })}
            />
            <ActionBtn
              icon="trash-outline"
              label={t('detail.delete', locale)}
              onPress={handleDelete}
              danger
            />
          </View>

          {/* Transcript playback card — sage-tinted. We don't store audio, so no
               play button here; the sparkle glyph signals "AI-parsed text". */}
          {txn.raw_transcript && (
            <View style={styles.transcriptCard}>
              <View style={styles.transcriptIcon}>
                <Ionicons name="sparkles" size={14} color={Colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.transcriptQuote} numberOfLines={4}>
                  "{txn.raw_transcript}"
                </Text>
                <Text style={styles.transcriptMeta}>{t('detail.transcript', locale)}</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — geometry traced from S_Detail in mobile-screens-3.jsx
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink3 ?? Colors.textSecondary,
  },
  content: {
    paddingBottom: 40,
  },

  // Top row — back + dots pills
  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderWidth: 0.5,
    borderColor: Colors.line ?? 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPillPressed: { opacity: 0.6 },

  // Hero
  hero: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 6,
  },
  merchantName: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 10,
  },
  heroAmount: {
    marginTop: 4,
  },
  categoryChip: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  categoryChipLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // Fields
  fieldsCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
  },
  detailRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  detailRowDivider: {
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  detailLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink3 ?? Colors.textSecondary,
  },
  detailValue: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.ink ?? Colors.text,
    marginTop: 2,
  },

  // Actions
  actionsRow: {
    marginTop: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: Colors.line ?? 'rgba(0,0,0,0.06)',
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  actionBtnPressed: { opacity: 0.6 },
  actionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12,
    fontWeight: '600',
  },

  // Transcript card
  transcriptCard: {
    marginTop: 20,
    marginHorizontal: 20,
    padding: 14,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transcriptIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.accent ?? Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptQuote: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    fontStyle: 'italic',
    color: Colors.ink2 ?? Colors.textSecondary,
    lineHeight: 19,
  },
  transcriptMeta: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 11,
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 2,
  },
})
