import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { MerchantAvatar } from '../../src/components/MerchantAvatar'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { formatCurrency } from '@voice-expense/shared'
import type { Transaction } from '@voice-expense/shared'

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
  const [txn, setTxn] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (data) setTxn(data as Transaction)
        setLoading(false)
      })
  }, [id])

  async function handleDelete() {
    if (!txn) return
    Alert.alert('Delete transaction', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase
            .from('transactions')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', txn.id)
          router.back()
        },
      },
    ])
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
        <Text style={styles.errorText}>Transaction not found</Text>
      </View>
    )
  }

  const isCredit = txn.direction === 'credit'
  const amountColor = isCredit ? Colors.income : Colors.text

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.hero}>
          <MerchantAvatar merchant={txn.merchant} size={72} />
          <Text style={styles.merchantName}>{txn.merchant ?? 'Unknown'}</Text>
          <Text style={[styles.amount, { color: amountColor }]}>
            {isCredit ? '+' : '-'}
            {formatCurrency(txn.amount, txn.currency_code)}
          </Text>
          <Text style={styles.date}>
            {new Date(txn.transacted_at).toLocaleDateString('en', {
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
          <DetailRow label="Category" value={txn.category_id} />
          <DetailRow
            label="Payment Method"
            value={txn.payment_method?.replace('_', ' ') ?? null}
          />
          <DetailRow label="Source" value={txn.source} />
          <DetailRow label="Note" value={txn.note} />
          {txn.raw_transcript && (
            <DetailRow label="Voice Transcript" value={txn.raw_transcript} />
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={styles.editButton}
            onPress={() => router.push({ pathname: '/transaction/edit', params: { id: txn.id } })}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete</Text>
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
    fontFamily: Typography.fontFamily.monoBold,
    fontSize: Typography.size['3xl'],
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
