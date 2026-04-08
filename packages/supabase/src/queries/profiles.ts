import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProfileUpdate } from '@voice-expense/shared'

export async function getProfile(client: SupabaseClient, userId: string) {
  return client.from('profiles').select('*').eq('id', userId).single()
}

export async function upsertProfile(client: SupabaseClient, userId: string, data: ProfileUpdate) {
  return client
    .from('profiles')
    .upsert({ id: userId, ...data, updated_at: new Date().toISOString() })
    .select()
    .single()
}
