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
      payment_method TEXT NOT NULL DEFAULT 'cash',
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
  const tableInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)')
  const hasColumn = tableInfo.some((col) => col.name === 'merchant_domain')
  if (!hasColumn) {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN merchant_domain TEXT')
  }
}
