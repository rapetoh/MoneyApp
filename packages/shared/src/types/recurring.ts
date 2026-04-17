export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurringRule {
  id: string
  user_id: string
  template_txn_id: string | null
  name: string | null           // display name / merchant
  amount: number
  currency_code: string
  category_id: string | null
  direction: 'debit' | 'credit'
  payment_method: string | null
  note: string | null
  frequency: RecurringFrequency
  interval: number
  starts_at: string
  ends_at: string | null
  last_generated: string | null
  is_active: boolean
  created_at: string
}
