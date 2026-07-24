/**
 * All reads and writes for transactions go through here.
 * This is the single source of truth — SQLite locally, Supabase via SyncManager.
 */
import type { SQLiteBindValue } from 'expo-sqlite'
import { getDb } from './localDb'
import type { Transaction } from '@voice-expense/shared'

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    amount: row.amount as number,
    direction: row.direction as Transaction['direction'],
    currency_code: row.currency_code as string,
    category_id: (row.category_id as string) ?? null,
    merchant: (row.merchant as string) ?? null,
    merchant_domain: (row.merchant_domain as string) ?? null,
    note: (row.note as string) ?? null,
    payment_method: row.payment_method as Transaction['payment_method'],
    amount_in_profile_currency: (row.amount_in_profile_currency as number) ?? null,
    fx_rate_to_profile: (row.fx_rate_to_profile as number) ?? null,
    fx_rate_date: (row.fx_rate_date as string) ?? null,
    transacted_at: row.transacted_at as string,
    source: row.source as Transaction['source'],
    raw_transcript: (row.raw_transcript as string) ?? null,
    ai_confidence: (row.ai_confidence as number) ?? null,
    is_recurring: Boolean(row.is_recurring),
    recurring_rule_id: (row.recurring_rule_id as string) ?? null,
    client_id: row.client_id as string,
    client_created_at: row.client_created_at as string,
    version: row.version as number,
    is_deleted: Boolean(row.is_deleted),
    deleted_at: (row.deleted_at as string) ?? null,
    synced_at: (row.synced_at as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function getTransactions(userId: string): Promise<Transaction[]> {
  const db = await getDb()
  const rows = await db.getAllAsync(
    'SELECT * FROM transactions WHERE user_id = ? AND is_deleted = 0 ORDER BY transacted_at DESC',
    [userId],
  )
  return (rows as Record<string, unknown>[]).map(rowToTransaction)
}

export async function upsertTransaction(txn: Transaction): Promise<void> {
  const db = await getDb()
  await db.runAsync(
    `INSERT INTO transactions (
      id, user_id, amount, direction, currency_code, category_id, merchant, merchant_domain, note,
      payment_method, amount_in_profile_currency, fx_rate_to_profile, fx_rate_date,
      transacted_at, source, raw_transcript, ai_confidence,
      is_recurring, recurring_rule_id, client_id, client_created_at, version,
      is_deleted, deleted_at, synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      amount = excluded.amount,
      direction = excluded.direction,
      category_id = excluded.category_id,
      merchant = excluded.merchant,
      merchant_domain = excluded.merchant_domain,
      note = excluded.note,
      payment_method = excluded.payment_method,
      amount_in_profile_currency = excluded.amount_in_profile_currency,
      fx_rate_to_profile = excluded.fx_rate_to_profile,
      fx_rate_date = excluded.fx_rate_date,
      transacted_at = excluded.transacted_at,
      version = excluded.version,
      is_deleted = excluded.is_deleted,
      deleted_at = excluded.deleted_at,
      synced_at = excluded.synced_at,
      updated_at = excluded.updated_at
    WHERE excluded.version >= transactions.version`,
    [
      txn.id,
      txn.user_id,
      txn.amount,
      txn.direction,
      txn.currency_code,
      txn.category_id ?? null,
      txn.merchant ?? null,
      txn.merchant_domain ?? null,
      txn.note ?? null,
      txn.payment_method,
      txn.amount_in_profile_currency ?? null,
      txn.fx_rate_to_profile ?? null,
      txn.fx_rate_date ?? null,
      txn.transacted_at,
      txn.source,
      txn.raw_transcript ?? null,
      txn.ai_confidence ?? null,
      txn.is_recurring ? 1 : 0,
      txn.recurring_rule_id ?? null,
      txn.client_id,
      txn.client_created_at,
      txn.version,
      txn.is_deleted ? 1 : 0,
      txn.deleted_at ?? null,
      txn.synced_at ?? null,
      txn.created_at,
      txn.updated_at,
    ],
  )
}

export async function softDeleteTransaction(id: string): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.runAsync(
    'UPDATE transactions SET is_deleted = 1, deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?',
    [now, now, id],
  )
}

export async function updateTransactionFields(
  id: string,
  fields: Partial<Pick<Transaction, 'amount' | 'merchant' | 'note' | 'category_id' | 'payment_method' | 'direction' | 'is_recurring'>>,
): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?', 'version = version + 1']
  const values: unknown[] = [now]

  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = ?`)
    // SQLite binds booleans as 0/1; scalars and null pass through unchanged.
    const coerced = typeof val === 'boolean' ? (val ? 1 : 0) : val ?? null
    values.push(coerced)
  }
  values.push(id)

  await db.runAsync(
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`,
    values as SQLiteBindValue[],
  )
}

/**
 * Update only the `amount_in_profile_currency` snapshot for a row.
 * Used by `editTransaction` when the user changes the txn amount —
 * the rate is dated to the transaction's day (unchanged) so we can
 * recompute the converted amount in place without a network call.
 * Does not touch the row's version or sync state; the caller's
 * `editTransaction` already bumps version + enqueues a sync.
 */
export async function updateAmountSnapshot(
  id: string,
  amountInProfileCurrency: number,
): Promise<void> {
  const db = await getDb()
  await db.runAsync(
    'UPDATE transactions SET amount_in_profile_currency = ? WHERE id = ?',
    [amountInProfileCurrency, id],
  )
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  const db = await getDb()
  const row = await db.getFirstAsync('SELECT * FROM transactions WHERE id = ?', [id])
  if (!row) return null
  return rowToTransaction(row as Record<string, unknown>)
}

/**
 * Wipes every row from local SQLite for this user. Called from the
 * Privacy → Delete all flow after the server-side `delete-user` Edge
 * Function has cleared the user's account, so the next sign-in (with a
 * fresh account) doesn't see ghosts of the deleted data. Also clears the
 * sync queue because any pending entries reference rows that no longer
 * exist on Supabase.
 */
export async function wipeAllUserData(userId: string): Promise<void> {
  const db = await getDb()
  await db.runAsync('DELETE FROM transactions WHERE user_id = ?', [userId])
  // Sync queue is not user-scoped at the schema level (only one user is
  // ever signed in at a time), so we clear it wholesale.
  await db.runAsync('DELETE FROM sync_queue')
}

/**
 * True when a live recurring-generated row already exists for the given
 * (user, rule, calendar-date) tuple. Used by `runRecurringCatchUp` to
 * skip occurrences that the server cron has already produced and
 * `pullRemote` has already brought into SQLite — without this check the
 * catch-up loop would hit the partial unique index on insert.
 */
export async function hasRecurringOccurrence(
  userId: string,
  ruleId: string,
  isoDate: string,
): Promise<boolean> {
  const db = await getDb()
  const day = isoDate.slice(0, 10)
  const row = await db.getFirstAsync(
    `SELECT 1 FROM transactions
     WHERE user_id = ?
       AND recurring_rule_id = ?
       AND substr(transacted_at, 1, 10) = ?
       AND is_deleted = 0
     LIMIT 1`,
    [userId, ruleId, day],
  )
  return Boolean(row)
}
