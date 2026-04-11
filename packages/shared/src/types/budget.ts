export type BudgetPeriod = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Budget {
  id: string
  user_id: string
  category_id: string | null
  amount: number
  period: BudgetPeriod
  currency_code: string
  starts_at: string // date
  is_active: boolean
  created_at: string
  updated_at: string
}

export type BudgetInsert = Omit<Budget, 'created_at' | 'updated_at'>
export type BudgetUpdate = Partial<BudgetInsert> & { id: string }
