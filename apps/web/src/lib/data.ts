import type { SupabaseClient } from '@supabase/supabase-js'

export async function getProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return data
}

export async function getTransactions(
  supabase: SupabaseClient,
  userId: string,
  limit?: number,
) {
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('transacted_at', { ascending: false })

  if (limit) query = query.limit(limit)
  const { data } = await query
  return data ?? []
}

export async function getCategories(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('name')
  return data ?? []
}

export async function getActiveBudgets(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getCurrentUser(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
