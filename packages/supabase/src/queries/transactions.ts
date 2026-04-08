import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transaction, TransactionInsert, TransactionUpdate } from '@voice-expense/shared'

export async function getTransactions(
  client: SupabaseClient,
  userId: string,
  options: { limit?: number; offset?: number } = {},
) {
  const { limit = 50, offset = 0 } = options
  return client
    .from('transactions')
    .select('*, categories(id, name, color, icon)')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('transacted_at', { ascending: false })
    .range(offset, offset + limit - 1)
}

export async function insertTransaction(client: SupabaseClient, transaction: TransactionInsert) {
  return client.from('transactions').insert(transaction).select().single()
}

export async function updateTransaction(client: SupabaseClient, update: TransactionUpdate) {
  return client
    .from('transactions')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', update.id)
    .select()
    .single()
}

export async function softDeleteTransaction(client: SupabaseClient, id: string) {
  return client
    .from('transactions')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
}

export async function getTransactionById(client: SupabaseClient, id: string) {
  return client
    .from('transactions')
    .select('*, categories(id, name, color, icon)')
    .eq('id', id)
    .single()
}
