export type PaymentMethod =
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'digital_wallet'
  | 'bank_transfer'
  | 'other'

export type TransactionSource =
  | 'voice'
  | 'manual'
  | 'scan'
  | 'shortcut'
  | 'notification_listener'
  | 'recurring_generated'

export type TransactionDirection = 'debit' | 'credit'

export interface Transaction {
  id: string
  user_id: string
  amount: number
  direction: TransactionDirection
  currency_code: string
  category_id: string | null
  merchant: string | null
  merchant_domain: string | null
  note: string | null
  payment_method: PaymentMethod | null
  transacted_at: string // ISO 8601
  source: TransactionSource
  raw_transcript: string | null
  ai_confidence: number | null
  is_recurring: boolean
  recurring_rule_id: string | null
  // Sync fields
  client_id: string
  client_created_at: string
  version: number
  is_deleted: boolean
  deleted_at: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
}

export type TransactionInsert = Omit<Transaction, 'created_at' | 'updated_at'>
export type TransactionUpdate = Partial<TransactionInsert> & { id: string }
