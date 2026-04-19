import { useEffect, useState, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
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
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { formatCurrency, t } from '@voice-expense/shared'
import type { Transaction, Locale } from '@voice-expense/shared'

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
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

  // Re-fetch when edit screen saves (emits DataEvents while this screen is still mounted)
  useEffect(() => {
    if (!user?.id) return
    return DataEvents.onTransactions(user.id, loadTxn)
  }, [user?.id, loadTxn])

  async function handleDelete() {
    if (!txn) return
    // Snapshot the row so Undo can restore it precisely (version bump, flags, etc).
    const snapshot = txn
    const merchantLabel = snapshot.merchant ?? t('transactions.unknown', locale)
    const formatted = formatCurrency(snapshot.amount, currency)

    // Soft-delete immediately. Design §3 Motion: "Everything non-destructive
    // should have an Undo snackbar." The snackbar IS the confirmation — the
    // prior "This cannot be undone" alert contradicted the new behavior.
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
        // Restore: re-upsert the snapshot with is_deleted=false and a fresh
        // version bump so it supersedes the deletion on remote.
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
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  if (!txn) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('detail.not_found', locale)}</Text>
      </View>
    )
  }

  const isCredit = txn.direction === 'credit'
  const amountColor = isCredit ? Colors.income : Colors.text
  const categoryName = txn.category_id
    ? (categoryMap[txn.category_id]?.name ?? null)
    : null

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.hero}>
          <MerchantAvatar merchant={txn.merchant} merchantDomain={txn.merchant_domain} size={72} />
          <Text style={styles.merchantName}>{txn.merchant ?? t('transactions.unknown', locale)}</Text>
          <Text style={[styles.amount, { color: amountColor }]}>
            {isCredit ? '+' : '-'}
            {formatCurrency(txn.amount, currency)}
          </Text>
          <Text style={styles.date}>
            {new Date(txn.transacted_at).toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {/* Details */}
        <View style={styles.detailsCard}>
          <DetailRow label={t('detail.category', locale)} value={categoryName} />
          <DetailRow
            label={t('detail.payment', locale)}
            value={txn.payment_method?.replace('_', ' ') ?? null}
          />
          <DetailRow label={t('detail.source', locale)} value={txn.source} />
          <DetailRow label={t('detail.note', locale)} value={txn.note} />
          {txn.raw_transcript && (
            <DetailRow label={t('detail.transcript', locale)} value={txn.raw_transcript} />
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={styles.editButton}
            onPress={() => router.push({ pathname: '/transaction/edit', params: { id: txn.id } })}
          >
            <Text style={styles.editButtonText}>{t('detail.edit', locale)}</Text>
          </Pressable>
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>{t('detail.delete', locale)}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

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
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
  content: {
    padding: Spacing.base,
    gap: Spacing.base,
    paddingBottom: Spacing['3xl'],
  },
  hero: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  merchantName: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.xl,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  amount: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: Typography.size['4xl'],
    fontWeight: '600',
    letterSpacing: -0.8,
    color: Colors.text,
  },
  date: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  detailsCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.text,
    flex: 2,
    textAlign: 'right',
    textTransform: 'capitalize',
  },
  actions: {
    gap: Spacing.sm,
  },
  editButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    backgroundColor: Colors.card,
  },
  editButtonText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: Colors.destructive,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.destructive,
  },
})
