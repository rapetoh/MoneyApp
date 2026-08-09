'use client'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@voice-expense/shared'
import { getSupabaseEnv } from '../env'

export function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getSupabaseEnv()
  return createBrowserClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
