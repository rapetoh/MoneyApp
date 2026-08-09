import type { Database } from './database.types'

export type BudgetPeriod = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

// `period` carries a CHECK constraint the generated type can't see (it
// comes back as a bare `string`) — narrowed to BudgetPeriod here. Every
// other column is re-exported as generated: see database.types.ts.
export type Budget = Omit<Database['public']['Tables']['budgets']['Row'], 'period'> & {
  period: BudgetPeriod
}
export type BudgetInsert = Omit<Database['public']['Tables']['budgets']['Insert'], 'period'> & {
  period: BudgetPeriod
}
export type BudgetUpdate = Omit<Database['public']['Tables']['budgets']['Update'], 'period'> & {
  period?: BudgetPeriod
  id: string
}
