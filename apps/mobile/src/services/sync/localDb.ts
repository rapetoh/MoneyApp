import type { SQLiteDatabase } from 'expo-sqlite'

/**
 * The slice of the SQLite API the schema core is written against.
 * `SQLiteDatabase` satisfies it structurally; so does the node:sqlite
 * shim in `scripts/localdb-migration-test.mjs`, which is how the
 * upgrade path is regression-tested off-device.
 */
export interface SchemaDb {
  execAsync(source: string): Promise<void>
  getFirstAsync<T>(source: string): Promise<T | null>
  getAllAsync<T>(source: string): Promise<T[]>
}

/**
 * Canonical column manifest for `transactions` — the single source of
 * truth for the local schema. `initSchema`'s CREATE TABLE, the migration
 * table-rebuild, and `upsertTransaction`'s INSERT list are all generated
 * from this list, so they cannot drift from one another. (A table
 * rebuild with its own hard-coded column list once dropped the FX
 * columns the same launch had just added — audit 03-F3/06-F6.)
 *
 * To add a column: append a spec here (fresh installs get it via the
 * generated CREATE TABLE) and append a MIGRATIONS step with the matching
 * ALTER TABLE ADD COLUMN (existing installs get it there).
 */
export const TRANSACTION_COLUMNS = [
  { name: 'id', ddl: 'TEXT PRIMARY KEY' },
  { name: 'user_id', ddl: 'TEXT NOT NULL' },
  { name: 'amount', ddl: 'REAL NOT NULL' },
  { name: 'direction', ddl: 'TEXT NOT NULL' },
  { name: 'currency_code', ddl: "TEXT NOT NULL DEFAULT 'USD'" },
  { name: 'category_id', ddl: 'TEXT' },
  { name: 'merchant', ddl: 'TEXT' },
  { name: 'merchant_domain', ddl: 'TEXT' },
  { name: 'note', ddl: 'TEXT' },
  { name: 'payment_method', ddl: 'TEXT' },
  { name: 'amount_in_profile_currency', ddl: 'REAL' },
  { name: 'fx_rate_to_profile', ddl: 'REAL' },
  { name: 'fx_rate_date', ddl: 'TEXT' },
  { name: 'transacted_at', ddl: 'TEXT NOT NULL' },
  { name: 'source', ddl: "TEXT NOT NULL DEFAULT 'manual'" },
  { name: 'raw_transcript', ddl: 'TEXT' },
  { name: 'ai_confidence', ddl: 'REAL' },
  { name: 'is_recurring', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'recurring_rule_id', ddl: 'TEXT' },
  { name: 'recurring_frequency', ddl: 'TEXT' },
  { name: 'client_id', ddl: 'TEXT NOT NULL' },
  { name: 'client_created_at', ddl: 'TEXT NOT NULL' },
  { name: 'version', ddl: 'INTEGER NOT NULL DEFAULT 1' },
  { name: 'is_deleted', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'deleted_at', ddl: 'TEXT' },
  { name: 'synced_at', ddl: 'TEXT' },
  { name: 'created_at', ddl: 'TEXT NOT NULL' },
  { name: 'updated_at', ddl: 'TEXT NOT NULL' },
] as const

export type TransactionColumnName = (typeof TRANSACTION_COLUMNS)[number]['name']

export const TRANSACTION_COLUMN_NAMES: readonly TransactionColumnName[] = TRANSACTION_COLUMNS.map(
  (c) => c.name,
)

function transactionsCreateSql(tableName: string): string {
  const columns = TRANSACTION_COLUMNS.map((c) => `${c.name} ${c.ddl}`).join(',\n      ')
  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n      ${columns}\n    )`
}

const BASE_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_txn_user_date ON transactions (user_id, transacted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_txn_user_deleted ON transactions (user_id, is_deleted);
`

// Partial unique index mirroring Supabase migration 013.
// substr(transacted_at, 1, 10) takes the YYYY-MM-DD slice (ISO strings
// stored as TEXT) — safe because all serializations go through
// Date.toISOString(). Scoped to source='recurring_generated': since
// migration 013 links user-entered template transactions to their rule
// too, and a manually logged bill may legitimately share (rule, date)
// with a generated occurrence, only engine-generated rows participate
// in dedup.
const RECURRING_DEDUP_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_recurring_dedup
    ON transactions (user_id, recurring_rule_id, substr(transacted_at, 1, 10))
    WHERE recurring_rule_id IS NOT NULL AND is_deleted = 0
      AND source = 'recurring_generated'
`

let dbPromise: Promise<SQLiteDatabase> | null = null

export function getDb(): Promise<SQLiteDatabase> {
  // Promise-based singleton: concurrent first callers all await the same
  // schema/migration pass instead of racing past it, and a failed open
  // resets so the next call retries rather than returning a handle whose
  // migrations never ran.
  if (!dbPromise) {
    dbPromise = openDatabase().catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

async function openDatabase(): Promise<SQLiteDatabase> {
  // Imported lazily so this module loads off-device too — the migration
  // regression test runs the schema core under Node with a node:sqlite
  // shim standing in for expo-sqlite.
  const { openDatabaseAsync } = await import('expo-sqlite')
  const db = await openDatabaseAsync('voice_expense.db')
  await initDatabase(db)
  return db
}

/** Test seam: lets the regression test hand the store a shim handle. */
export function __setDbForTests(handle: SQLiteDatabase | null): void {
  dbPromise = handle ? Promise.resolve(handle) : null
}

/**
 * Boot sequence for a database handle: ensure the base schema, then
 * either stamp a fresh database as already-current or migrate an
 * existing one forward step by step.
 */
export async function initDatabase(db: SchemaDb): Promise<void> {
  const fresh = !(await transactionsTableExists(db))
  await initSchema(db)
  if (fresh) {
    // Born on the current schema: no legacy duplicates can exist, so the
    // dedup index is safe to build immediately, and the migration chain
    // (written for upgrades) must never replay — stamp the version.
    await db.execAsync(RECURRING_DEDUP_INDEX_SQL)
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  } else {
    await runMigrations(db)
  }
}

async function initSchema(db: SchemaDb): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    ${transactionsCreateSql('transactions')};

    ${BASE_INDEXES_SQL}
    -- idx_txn_recurring_dedup is deliberately not created here: on
    -- existing installs it may only be built after the v0 -> v1 dedup
    -- sweep. Fresh installs get it in initDatabase(); upgrades get it
    -- in consolidateLegacySchemaV1().

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
}

/**
 * MIGRATIONS[v] migrates a database at PRAGMA user_version v to v + 1.
 * The runner applies each step exactly once, in order, inside a
 * transaction that also bumps user_version — a failed step rolls back
 * wholesale and is retried on the next launch. Steps from v1 onward may
 * assume the canonical schema of their starting version; step 0 alone
 * inherits the pre-versioning era, when migrations re-sniffed
 * PRAGMA table_info on every launch, so it must tolerate every state
 * that era left in the field and is written defensively.
 */
export const MIGRATIONS: ReadonlyArray<(db: SchemaDb) => Promise<void>> = [
  consolidateLegacySchemaV1,
]

/** The version a fully-migrated database reports. Grows by appending to MIGRATIONS. */
export const SCHEMA_VERSION = MIGRATIONS.length

export async function runMigrations(db: SchemaDb): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  for (let v = row?.user_version ?? 0; v < SCHEMA_VERSION; v++) {
    await db.execAsync('BEGIN IMMEDIATE')
    try {
      await MIGRATIONS[v](db)
      // Same transaction as the step itself: a migration either fully
      // applies and is recorded, or leaves no trace.
      await db.execAsync(`PRAGMA user_version = ${v + 1}`)
      await db.execAsync('COMMIT')
    } catch (err) {
      await db.execAsync('ROLLBACK').catch(() => undefined)
      throw err
    }
  }
}

type LiveColumn = { name: string; notnull: number; dflt_value: string | null }

async function transactionsTableExists(db: SchemaDb): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transactions'",
  )
  return row !== null
}

async function getLiveColumns(db: SchemaDb): Promise<LiveColumn[]> {
  return db.getAllAsync<LiveColumn>('PRAGMA table_info(transactions)')
}

/**
 * v0 -> v1: consolidate every pre-versioning database onto the canonical
 * schema. Field states this must absorb:
 *   - pre-FX installs — payment_method still NOT NULL DEFAULT 'cash',
 *     some or all of merchant_domain / FX columns / recurring_frequency
 *     missing;
 *   - installs that ran the defective table rebuild, which dropped the
 *     FX columns the same launch had just added (audit 03-F3/06-F6);
 *   - hotfixed installs already carrying the full column set.
 */
async function consolidateLegacySchemaV1(db: SchemaDb): Promise<void> {
  // 1 — Bring the column set up to the manifest, whatever subset this
  // install's history produced. Only historically-nullable columns can
  // be missing, so ADD COLUMN with the manifest DDL is always legal.
  // FX snapshot columns stay NULL until the fxBackfill sweep fills them
  // (mirror of Supabase migration 011).
  const live = await getLiveColumns(db)
  const liveNames = new Set(live.map((c) => c.name))
  for (const col of TRANSACTION_COLUMNS) {
    if (!liveNames.has(col.name)) {
      await db.execAsync(`ALTER TABLE transactions ADD COLUMN ${col.name} ${col.ddl}`)
    }
  }

  // 2 — Soft-delete recurring duplicates from prior catch-up races.
  // Keep the earliest row per (user, rule, date) — typically the
  // server-cron row that arrived via pullRemote — and soft-mark the
  // rest. Hard cleanup happens server-side via migration 008; this is
  // the local mirror, and it must precede any dedup-index build below.
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

  // 3 — Drop the legacy payment_method NOT NULL DEFAULT 'cash'. An
  // upsert with payment_method = null (possible since the AI prompt
  // fix) fails the NOT NULL check on any database created before the
  // constraint was loosened, and SQLite has no DROP NOT NULL — so this
  // is a full table rebuild.
  const pm = live.find((c) => c.name === 'payment_method')
  if (pm && (pm.notnull === 1 || pm.dflt_value !== null)) {
    await rebuildTransactionsTable(db)
  }

  // 4 — Dedup index with the narrowed predicate. Replaces the broader
  // mirror of Supabase migration 008 where one exists; the rebuild in
  // step 3 already builds the narrow one, making this a no-op there.
  const dedupIdx = await db.getFirstAsync<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_txn_recurring_dedup'",
  )
  if (!dedupIdx?.sql?.includes('recurring_generated')) {
    await db.execAsync('DROP INDEX IF EXISTS idx_txn_recurring_dedup')
    await db.execAsync(RECURRING_DEDUP_INDEX_SQL)
  }
}

/**
 * SQLite's table-rebuild pattern, for constraint changes ALTER cannot
 * express: build a replacement from the manifest, copy rows across,
 * swap names, recreate the indexes the DROP took down. The copy names
 * its columns explicitly on both sides and copies exactly the columns
 * the manifest and the live table share — a manifest column the live
 * table lacks fills with its DDL default, and the only way to lose a
 * column is to remove it from the manifest, never a stale list here.
 * Callers must have already swept recurring duplicates: the unique
 * dedup index is rebuilt as part of the swap. (No PRAGMA foreign_keys
 * dance — this schema declares no foreign keys, and the runner's
 * transaction owns atomicity.)
 */
async function rebuildTransactionsTable(db: SchemaDb): Promise<void> {
  const liveNames = new Set((await getLiveColumns(db)).map((c) => c.name))
  const copied = TRANSACTION_COLUMN_NAMES.filter((name) => liveNames.has(name)).join(', ')
  await db.execAsync(`
    DROP TABLE IF EXISTS transactions_new;
    ${transactionsCreateSql('transactions_new')};
    INSERT INTO transactions_new (${copied}) SELECT ${copied} FROM transactions;
    DROP TABLE transactions;
    ALTER TABLE transactions_new RENAME TO transactions;
    ${BASE_INDEXES_SQL}
    ${RECURRING_DEDUP_INDEX_SQL};
  `)
}

/**
 * Deletes every locally-stored row: all transactions and all queued sync
 * operations. Called from the sign-out teardown (`resetLocalState` in
 * useAuth) so nothing one account wrote is readable — or replayable via
 * the queue — in the next account's session. A full wipe rather than a
 * user-scoped DELETE: only one account is ever signed in at a time, and
 * rows orphaned by accounts that signed out before this teardown existed
 * must go too.
 */
export async function wipeLocalDatabase(): Promise<void> {
  const db = await getDb()
  await db.execAsync(`
    DELETE FROM transactions;
    DELETE FROM sync_queue;
  `)
}
