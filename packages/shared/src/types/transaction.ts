import type { RecurringFrequency } from './recurring'

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
  /** Amount converted to the user's profile currency using the FX
   *  rate on `fx_rate_date`. Null on historical rows that pre-date
   *  migration 011 and have foreign currencies awaiting backfill.
   *  Aggregations should sum this column (and skip null rows) to
   *  keep multi-currency totals coherent — summing `amount` blindly
   *  across currencies is the original LOGIC §2.1 bug. */
  amount_in_profile_currency: number | null
  /** Ratio used to convert `amount` → `amount_in_profile_currency`.
   *  1.0 when the transaction's currency matches the profile's. */
  fx_rate_to_profile: number | null
  /** Calendar date the rate above was retrieved for. Either the
   *  transaction's date (write-time snapshot) or null for unfilled
   *  rows. ISO YYYY-MM-DD. */
  fx_rate_date: string | null
  transacted_at: string // ISO 8601
  source: TransactionSource
  raw_transcript: string | null
  ai_confidence: number | null
  is_recurring: boolean
  recurring_rule_id: string | null
  /** The cadence the user chose when marking this transaction recurring.
   *  Durable carrier of intent: the server-side trigger reads it to create
   *  or link the recurring_rules row. Null when is_recurring is false or
   *  for rows generated FROM a rule. */
  recurring_frequency: RecurringFrequency | null
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
