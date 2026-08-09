/**
 * Regression test for the v1 -> v2 migration (fix-plan 1.6): the
 * sync_queue status/next_attempt_at columns, the carry-forward of
 * already-dead-lettered entries, and the categories/budgets/
 * recurring_rules tables. Complements localDb.migration.test.ts, which
 * covers the pre-existing v0 -> v1 path.
 */
import { strict as assert } from 'node:assert'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  initDatabase,
  SCHEMA_VERSION,
  CATEGORY_COLUMN_NAMES,
  BUDGET_COLUMN_NAMES,
  RECURRING_RULE_COLUMN_NAMES,
} from '../localDb'
import { DatabaseSync, openShim, makeTempDir, type Shim } from './testDb'

function tableColumns(db: Shim, table: string): string[] {
  return (db.raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .map((c) => c.name)
    .sort()
}

function userVersion(db: Shim): number {
  return (db.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
}

describe.skipIf(!DatabaseSync)('localDb v1 -> v2 sync contract migration', () => {
  let tmp: { dir: string; cleanup: () => void }

  beforeAll(() => {
    tmp = makeTempDir('localdb-sync-contract-test-')
  })

  afterAll(() => {
    tmp.cleanup()
  })

  it('a v1 database (pre-outbox-rebuild) gains status/next_attempt_at and the three new tables', async () => {
    const db = openShim(`${tmp.dir}/v1.db`)
    // Reconstruct a plausible v1 install: the current transactions shape,
    // plus a sync_queue with retry_count but no status/next_attempt_at —
    // exactly what shipped before this item.
    db.raw.exec(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount REAL NOT NULL,
        direction TEXT NOT NULL, currency_code TEXT NOT NULL DEFAULT 'USD',
        category_id TEXT, merchant TEXT, merchant_domain TEXT, note TEXT,
        payment_method TEXT, amount_in_profile_currency REAL,
        fx_rate_to_profile REAL, fx_rate_date TEXT, transacted_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual', raw_transcript TEXT,
        ai_confidence REAL, is_recurring INTEGER NOT NULL DEFAULT 0,
        recurring_rule_id TEXT, recurring_frequency TEXT,
        client_id TEXT NOT NULL, client_created_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1, is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT, synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_txn_recurring_dedup
        ON transactions (user_id, recurring_rule_id, substr(transacted_at, 1, 10))
        WHERE recurring_rule_id IS NOT NULL AND is_deleted = 0 AND source = 'recurring_generated';
      CREATE TABLE sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, operation TEXT NOT NULL,
        entity_type TEXT NOT NULL DEFAULT 'transaction', entity_id TEXT NOT NULL,
        payload TEXT NOT NULL, client_timestamp TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL
      );
      PRAGMA user_version = 1;
    `)

    // A poisoned entry already stuck under the old retry_count >= 5
    // threshold — this must survive the migration as 'dead', not silently
    // become eligible ('pending') again.
    db.raw
      .prepare(
        `INSERT INTO sync_queue (operation, entity_type, entity_id, payload, client_timestamp, retry_count, last_error, created_at)
         VALUES ('create', 'transaction', 'poisoned-1', '{}', '2026-08-01T00:00:00Z', 7, 'stuck', '2026-08-01T00:00:00Z')`,
      )
      .run()

    await initDatabase(db)

    expect(userVersion(db)).toBe(SCHEMA_VERSION)

    const queueCols = tableColumns(db, 'sync_queue')
    expect(queueCols).toContain('status')
    expect(queueCols).toContain('next_attempt_at')

    const poisoned = db.raw.prepare("SELECT status FROM sync_queue WHERE entity_id = 'poisoned-1'").get() as {
      status: string
    }
    assert.equal(poisoned.status, 'dead', 'a pre-existing retry_count>=5 entry must carry forward as dead, not pending')

    expect(tableColumns(db, 'categories')).toEqual([...CATEGORY_COLUMN_NAMES].sort())
    expect(tableColumns(db, 'budgets')).toEqual([...BUDGET_COLUMN_NAMES].sort())
    expect(tableColumns(db, 'recurring_rules')).toEqual([...RECURRING_RULE_COLUMN_NAMES].sort())

    const syncMeta = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_meta'")
      .get()
    expect(syncMeta).toBeTruthy()
  })

  it('a fresh install gets the full schema in one shot, including the new tables', async () => {
    const db = openShim(`${tmp.dir}/fresh.db`)
    await initDatabase(db)

    expect(userVersion(db)).toBe(SCHEMA_VERSION)
    expect(tableColumns(db, 'categories')).toEqual([...CATEGORY_COLUMN_NAMES].sort())
    expect(tableColumns(db, 'budgets')).toEqual([...BUDGET_COLUMN_NAMES].sort())
    expect(tableColumns(db, 'recurring_rules')).toEqual([...RECURRING_RULE_COLUMN_NAMES].sort())
    expect(tableColumns(db, 'sync_queue')).toContain('status')

    // Idempotent — a second boot on the same handle replays nothing.
    await initDatabase(db)
    expect(userVersion(db)).toBe(SCHEMA_VERSION)
  })
})
