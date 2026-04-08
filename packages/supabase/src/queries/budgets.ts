import type { SupabaseClient } from '@supabase/supabase-js'
import type { BudgetInsert, BudgetUpdate } from '@voice-expense/shared'

export async function getBudgets(client: SupabaseClient, userId: string) {
  return client
    .from('budgets')
    .select('*, categories(id, name, color, icon)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
}

export async function insertBudget(client: SupabaseClient, budget: BudgetInsert) {
  return client.from('budgets').insert(budget).select().single()
}

export async function updateBudget(client: SupabaseClient, update: BudgetUpdate) {
  return client
    .from('budgets')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', update.id)
    .select()
    .single()
}

export async function deactivateBudget(client: SupabaseClient, id: string) {
  return client
    .from('budgets')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
}
