import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

/**
 * Thrown by every reader below when its Supabase read fails — a network
 * drop, an RLS denial, an expired session — never swallowed into `[]`/
 * `null` the way this file used to (fix-plan 2.13 / audit 08-F21
 * family: "a Supabase outage renders as 'No transactions match these
 * filters' on ten web routes... for a money app that is the difference
 * between 'we couldn't load your data' and 'your data is gone'").
 *
 * `apps/web/src/app/dashboard/error.tsx` is the backstop that catches
 * this (Next.js mounts it in place of the whole `dashboard` segment
 * whenever a Server Component throws during render) and renders a
 * distinct "couldn't load" state with Retry — the RSC equivalent of the
 * client pages' own `{ data, error }` load-state split, and what makes
 * an error state structurally impossible to confuse with a genuine
 * empty one (a *successful* read that happens to return zero rows).
 */
export class DataFetchError extends Error {
  readonly table: string
  readonly cause: PostgrestError

  constructor(table: string, cause: PostgrestError) {
    super(`Failed to load ${table}: ${cause.message}`)
    this.name = 'DataFetchError'
    this.table = table
    this.cause = cause
  }
}

// PostgREST's code for ".single() found no row" — a legitimate "doesn't
// exist yet" (e.g. a brand-new account read a beat before the
// `handle_new_user` trigger's insert lands), not a failure to surface
// as an error state. Every other error code is a real read failure.
const NO_ROWS_FOUND = 'PGRST116'

export async function getProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error && error.code !== NO_ROWS_FOUND) throw new DataFetchError('profiles', error)
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
  const { data, error } = await query
  if (error) throw new DataFetchError('transactions', error)
  return data ?? []
}

export async function getCategories(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('name')
  if (error) throw new DataFetchError('categories', error)
  return data ?? []
}

export async function getActiveBudgets(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (error) throw new DataFetchError('budgets', error)
  return data ?? []
}

export async function getCurrentUser(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
