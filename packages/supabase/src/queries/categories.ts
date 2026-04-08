import type { SupabaseClient } from '@supabase/supabase-js'
import type { CategoryInsert, CategoryUpdate } from '@voice-expense/shared'

export async function getCategories(client: SupabaseClient, userId: string) {
  return client
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('name', { ascending: true })
}

export async function insertCategory(client: SupabaseClient, category: CategoryInsert) {
  return client.from('categories').insert(category).select().single()
}

export async function updateCategory(client: SupabaseClient, update: CategoryUpdate) {
  return client
    .from('categories')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', update.id)
    .select()
    .single()
}

export async function archiveCategory(client: SupabaseClient, id: string) {
  return client
    .from('categories')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', id)
}
