import type { RecurringFrequency } from './recurring'
import type { Database } from './database.types'

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

// The columns below carry a Postgres CHECK constraint that `supabase gen
// types` cannot see (it only reads column types) — the generated Row/Insert/
// Update shapes type them as bare `string`. Narrowing them back to the
// app's literal unions here, on top of the generated shape rather than
// instead of it, is what keeps this file a real derivative of the schema:
// rename or drop `transactions.direction` in the DB and this type stops
// compiling, exactly like every other column.
type NarrowedTransactionColumns = {
  direction: TransactionDirection
  source: TransactionSource
  payment_method: PaymentMethod | null
  recurring_frequency: RecurringFrequency | null
}

type TransactionRow = Database['public']['Tables']['transactions']['Row']
type TransactionInsertRow = Database['public']['Tables']['transactions']['Insert']
type TransactionUpdateRow = Database['public']['Tables']['transactions']['Update']

/** `Transaction` documents each field inline for readers of this file —
 *  see the generated `TransactionRow` (database.types.ts) for the raw
 *  column list this is derived from. */
export type Transaction = Omit<TransactionRow, keyof NarrowedTransactionColumns> &
  NarrowedTransactionColumns & {
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
  }

export type TransactionInsert = Omit<TransactionInsertRow, keyof NarrowedTransactionColumns> &
  Partial<Pick<NarrowedTransactionColumns, 'payment_method' | 'recurring_frequency'>> &
  Pick<NarrowedTransactionColumns, 'direction' | 'source'>
export type TransactionUpdate = Partial<Omit<TransactionUpdateRow, keyof NarrowedTransactionColumns>> &
  Partial<NarrowedTransactionColumns> & { id: string }
