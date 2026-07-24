import * as SQLite from 'expo-sqlite'

let db: SQLite.SQLiteDatabase | null = null

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db
  db = await SQLite.openDatabaseAsync('voice_expense.db')
  await initSchema(db)
  return db
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      direction TEXT NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'USD',
      category_id TEXT,
      merchant TEXT,
      merchant_domain TEXT,
      note TEXT,
      payment_method TEXT,
      amount_in_profile_currency REAL,
      fx_rate_to_profile REAL,
      fx_rate_date TEXT,
      transacted_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      raw_transcript TEXT,
      ai_confidence REAL,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurring_rule_id TEXT,
      client_id TEXT NOT NULL,
      client_created_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_txn_user_date ON transactions (user_id, transacted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_txn_user_deleted ON transactions (user_id, is_deleted);
    -- idx_txn_recurring_dedup is created in migrateSchema(), AFTER the
    -- dedup sweep — building it inline here would fail on existing
    -- installs that already accumulated duplicates from prior races.

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'transaction',
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      client_timestamp TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_queue_entity ON sync_queue (entity_id);
  `)

  // Migrations for existing databases
  await migrateSchema(db)
}

async function migrateSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const tableInfo = await db.getAllAsync<{ name: string; notnull: number; dflt_value: string | null }>(
    'PRAGMA table_info(transactions)',
  )
  const hasColumn = tableInfo.some((col) => col.name === 'merchant_domain')
  if (!hasColumn) {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN merchant_domain TEXT')
  }

  // Migration 011 — FX snapshot columns. ADD COLUMN is safe on every
  // SQLite version; the columns are nullable so existing rows just
  // get NULL until the backfill sweep fills them in (same logic as
  // Supabase migration 011, but here it runs in `fxBackfill` on the
  // mobile side because we have profile.currency_code in app state).
  for (const col of ['amount_in_profile_currency', 'fx_rate_to_profile', 'fx_rate_date']) {
    if (!tableInfo.some((c) => c.name === col)) {
      const colType = col === 'fx_rate_date' ? 'TEXT' : 'REAL'
      await db.execAsync(`ALTER TABLE transactions ADD COLUMN ${col} ${colType}`)
    }
  }

  // Step 1 — Drop the legacy `payment_method NOT NULL DEFAULT 'cash'`
  // constraint from existing installs. SQLite has no DROP NOT NULL, so
  // we table-swap: copy rows into a freshly-built table with the
  // loosened column, then rename. Without this, an upsert with
  // payment_method=null (now possible after the AI prompt fix) fails
  // the NOT NULL check on any database created before this change.
  // Done BEFORE the dedup + unique-index work because the DROP TABLE
  // would otherwise also drop the new index.
  const pm = tableInfo.find((col) => col.name === 'payment_method')
  if (pm && (pm.notnull === 1 || pm.dflt_value !== null)) {
    await db.execAsync(`
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;
      CREATE TABLE transactions_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        direction TEXT NOT NULL,
        currency_code TEXT NOT NULL DEFAULT 'USD',
        category_id TEXT,
        merchant TEXT,
        merchant_domain TEXT,
        note TEXT,
        payment_method TEXT,
        transacted_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        raw_transcript TEXT,
        ai_confidence REAL,
        is_recurring INTEGER NOT NULL DEFAULT 0,
        recurring_rule_id TEXT,
        client_id TEXT NOT NULL,
        client_created_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO transactions_new SELECT
        id, user_id, amount, direction, currency_code, category_id,
        merchant, merchant_domain, note, payment_method, transacted_at,
        source, raw_transcript, ai_confidence, is_recurring,
        recurring_rule_id, client_id, client_created_at, version,
        is_deleted, deleted_at, synced_at, created_at, updated_at
      FROM transactions;
      DROP TABLE transactions;
      ALTER TABLE transactions_new RENAME TO transactions;
      CREATE INDEX IF NOT EXISTS idx_txn_user_date ON transactions (user_id, transacted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_txn_user_deleted ON transactions (user_id, is_deleted);
      COMMIT;
      PRAGMA foreign_keys = ON;
    `)
  }

  // Step 2 — Soft-delete any local recurring duplicates from prior
  // catch-up races. Keep the earliest row per (user, rule, date) —
  // typically the server-cron row that arrived via pullRemote — and
  // soft-mark the rest. Hard cleanup happens server-side via
  // migration 008; this is the local mirror so the next step's
  // unique-index build succeeds.
  await db.execAsync(`
    UPDATE transactions
    SET is_deleted = 1,
        deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id IN (
      SELECT id FROM transactions t
      WHERE t.recurring_rule_id IS NOT NULL
        AND t.is_deleted = 0
        AND EXISTS (
          SELECT 1 FROM transactions earlier
          WHERE earlier.user_id = t.user_id
            AND earlier.recurring_rule_id = t.recurring_rule_id
            AND substr(earlier.transacted_at, 1, 10) = substr(t.transacted_at, 1, 10)
            AND earlier.is_deleted = 0
            AND (earlier.created_at < t.created_at
                 OR (earlier.created_at = t.created_at AND earlier.id < t.id))
        )
    )
  `)

  // Step 3 — Partial unique index, mirroring Supabase migration 008.
  // Stops the mobile catch-up from inserting a duplicate locally even
  // before the queued upsert hits Supabase. substr(transacted_at, 1, 10)
  // takes the YYYY-MM-DD slice (ISO strings stored as TEXT) — safe
  // because all serializations go through Date.toISOString().
  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_recurring_dedup
      ON transactions (user_id, recurring_rule_id, substr(transacted_at, 1, 10))
      WHERE recurring_rule_id IS NOT NULL AND is_deleted = 0
  `)
}
