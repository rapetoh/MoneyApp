/**
 * All reads and writes for transactions go through here.
 * This is the single source of truth — SQLite locally, Supabase via SyncManager.
 */
import { getCalendars } from 'expo-localization'
import type { SQLiteBindValue } from 'expo-sqlite'
import { getDb, TRANSACTION_COLUMN_NAMES } from './localDb'
import type { TransactionColumnName } from './localDb'
import type { Transaction } from '@voice-expense/shared'
import { localDay } from '@voice-expense/shared'

/** Best-effort device zone — mirrors `useTransactions.ts`'s own
 *  `getDeviceTimeZone` (fix-plan 1.3 part 1) and `useRecurringRules.ts`'s
 *  `deviceTimeZone`. `local_day` (migration 017, NOT NULL) isn't part of
 *  the local SQLite manifest yet (Stage 2 adoption — see
 *  `upsertTransaction`'s note on `occurrence_date` for the same story one
 *  column earlier), so every local read recomputes it from
 *  `transacted_at` in this zone instead of a stored column. */
function getDeviceTimeZone(): string {
  try {
    return getCalendars()[0]?.timeZone ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

function rowToTransaction(row: Record<string, unknown>, tz: string): Transaction {
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
    // Server-only bookkeeping (migration 026, fix-plan 2.7) — not part of
    // the local SQLite manifest, same story as `local_day` above: no
    // local writer or reader needs "which currency was this snapshot
    // computed for" to render anything, only `change-currency` and the
    // FX backfill sweep's self-heal predicate do, and both operate
    // directly against Supabase.
    snapshot_currency: (row.snapshot_currency as string) ?? null,
    transacted_at: row.transacted_at as string,
    // Not a stored local column — see `getDeviceTimeZone`'s docstring above.
    local_day: localDay(row.transacted_at as string, tz),
    occurrence_date: (row.occurrence_date as string) ?? null,
    source: row.source as Transaction['source'],
    raw_transcript: (row.raw_transcript as string) ?? null,
    ai_confidence: (row.ai_confidence as number) ?? null,
    is_recurring: Boolean(row.is_recurring),
    recurring_rule_id: (row.recurring_rule_id as string) ?? null,
    recurring_frequency: (row.recurring_frequency as Transaction['recurring_frequency']) ?? null,
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
  const tz = getDeviceTimeZone()
  return (rows as Record<string, unknown>[]).map((row) => rowToTransaction(row, tz))
}

export async function upsertTransaction(txn: Transaction): Promise<void> {
  const db = await getDb()
  // Bind values keyed by manifest column name. The Record type fails
  // compilation the moment the manifest gains a column this map does not
  // supply, and the INSERT list below is generated from the same
  // manifest — the write path cannot drift from the schema.
  const row: Record<TransactionColumnName, SQLiteBindValue> = {
    id: txn.id,
    user_id: txn.user_id,
    amount: txn.amount,
    direction: txn.direction,
    currency_code: txn.currency_code,
    category_id: txn.category_id ?? null,
    merchant: txn.merchant ?? null,
    merchant_domain: txn.merchant_domain ?? null,
    note: txn.note ?? null,
    payment_method: txn.payment_method,
    amount_in_profile_currency: txn.amount_in_profile_currency ?? null,
    fx_rate_to_profile: txn.fx_rate_to_profile ?? null,
    fx_rate_date: txn.fx_rate_date ?? null,
    transacted_at: txn.transacted_at,
    source: txn.source,
    raw_transcript: txn.raw_transcript ?? null,
    ai_confidence: txn.ai_confidence ?? null,
    is_recurring: txn.is_recurring ? 1 : 0,
    recurring_rule_id: txn.recurring_rule_id ?? null,
    recurring_frequency: txn.recurring_frequency ?? null,
    // `Transaction` (packages/shared) doesn't carry `occurrence_date`
    // yet — threading the recurrence engine's real resolved civil day
    // through every local writer is fix-plan Stage 2. Deriving it here
    // from `transacted_at` keeps this identical to the value the old
    // `substr(transacted_at, 1, 10)` dedup key used (fix-plan 1.5's
    // `RECURRING_DEDUP_INDEX_SQL`), so this is a schema-shape change,
    // not a behaviour change, for every writer that still goes through
    // this function without supplying the real value.
    occurrence_date: txn.transacted_at.slice(0, 10),
    client_id: txn.client_id,
    client_created_at: txn.client_created_at,
    version: txn.version,
    is_deleted: txn.is_deleted ? 1 : 0,
    deleted_at: txn.deleted_at ?? null,
    synced_at: txn.synced_at ?? null,
    created_at: txn.created_at,
    updated_at: txn.updated_at,
  }
  await db.runAsync(
    `INSERT INTO transactions (${TRANSACTION_COLUMN_NAMES.join(', ')})
    VALUES (${TRANSACTION_COLUMN_NAMES.map(() => '?').join(', ')})
    -- SET list generated against TRANSACTION_COLUMNS below, not
    -- hand-maintained — every manifest column is accounted for here or in
    -- the exclusion comment (fix-plan 1.6 point 6 / audit 06-F16). Columns
    -- deliberately left out of SET:
    --   id             — the conflict target itself, never rewritten.
    --   user_id        — a row's owner cannot change via upsert.
    --   currency_code  — was missing from this SET list entirely (06-F16):
    --                    a synced echo of a row whose currency changed
    --                    silently kept the stale code. Included below now.
    --   raw_transcript — local-only (the Privacy screen's "voice not
    --                    stored" promise); a synced-back server row must
    --                    never overwrite the on-device transcript with the
    --                    NULL the server always holds for this column.
    --   client_id, client_created_at, created_at — identity/provenance
    --                    fields fixed at creation; an upsert of the same
    --                    logical row must not let them drift.
    ON CONFLICT(id) DO UPDATE SET
      amount = excluded.amount,
      direction = excluded.direction,
      currency_code = excluded.currency_code,
      category_id = excluded.category_id,
      merchant = excluded.merchant,
      merchant_domain = excluded.merchant_domain,
      note = excluded.note,
      payment_method = excluded.payment_method,
      amount_in_profile_currency = excluded.amount_in_profile_currency,
      fx_rate_to_profile = excluded.fx_rate_to_profile,
      fx_rate_date = excluded.fx_rate_date,
      transacted_at = excluded.transacted_at,
      source = excluded.source,
      ai_confidence = excluded.ai_confidence,
      is_recurring = excluded.is_recurring,
      recurring_rule_id = excluded.recurring_rule_id,
      recurring_frequency = excluded.recurring_frequency,
      occurrence_date = excluded.occurrence_date,
      version = excluded.version,
      is_deleted = excluded.is_deleted,
      deleted_at = excluded.deleted_at,
      synced_at = excluded.synced_at,
      updated_at = excluded.updated_at
    WHERE excluded.version >= transactions.version`,
    TRANSACTION_COLUMN_NAMES.map((name) => row[name]),
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
  fields: Partial<
    Pick<
      Transaction,
      | 'amount'
      | 'merchant'
      | 'note'
      | 'category_id'
      | 'payment_method'
      | 'direction'
      | 'is_recurring'
      | 'recurring_frequency'
    >
  >,
): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?', 'version = version + 1']
  const values: unknown[] = [now]

  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = ?`)
    // SQLite binds booleans as 0/1; scalars and null pass through unchanged.
    const coerced = typeof val === 'boolean' ? (val ? 1 : 0) : (val ?? null)
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
  await db.runAsync('UPDATE transactions SET amount_in_profile_currency = ? WHERE id = ?', [
    amountInProfileCurrency,
    id,
  ])
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  const db = await getDb()
  const row = await db.getFirstAsync('SELECT * FROM transactions WHERE id = ?', [id])
  if (!row) return null
  return rowToTransaction(row as Record<string, unknown>, getDeviceTimeZone())
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
 *
 * Queries `occurrence_date` (fix-plan 1.5) rather than
 * `substr(transacted_at, 1, 10)` — see `RECURRING_DEDUP_INDEX_SQL`'s
 * docstring in `localDb.ts` for why a UTC-day slice can miss a same
 * local-day duplicate or flag two legitimately distinct occurrences as
 * one. `isoDate` is still sliced to its first 10 characters for the
 * caller's convenience (today's only caller, `recurringCatchUp.ts`,
 * passes a full ISO instant, not a bare date) — full precision requires
 * that caller to pass the recurrence engine's own resolved
 * `occurrenceDate` instead of an instant, which is fix-plan Stage 2.
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
       AND occurrence_date = ?
       AND is_deleted = 0
     LIMIT 1`,
    [userId, ruleId, day],
  )
  return Boolean(row)
}
