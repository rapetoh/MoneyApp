/**
 * Regression test for the local SQLite schema migration path (audit
 * 03-F3 / 06-F6: the table rebuild that dropped the FX columns it had
 * just added, breaking every write until relaunch — fixed in Stage 0
 * item 0.6). Ported from the standalone `apps/mobile/scripts/
 * localdb-migration-test.mjs` script into the vitest harness — fix-plan
 * item 1.1 — with the same real code path and the same fixtures.
 *
 * Runs the REAL schema core from src/services/sync/localDb.ts — and the
 * real transactionStore write path — against `node:sqlite` databases
 * seeded with the schema states shipped builds left in the field.
 *
 * `node:sqlite` needs Node >= 22.5 (unflagged from Node 23.4 / backported
 * to later 22.x LTS points). Skips gracefully on older Node so `npm test`
 * stays green on any Node satisfying the repo's >=20 floor; the CI `test`
 * job pins a Node new enough to actually run it — see .github/workflows/
 * ci.yml.
 */
import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'
import type { SQLiteDatabase } from 'expo-sqlite'

// `transactionStore.ts` now resolves `local_day` (fix-plan 1.3 part 3) via
// `expo-localization`'s `getCalendars`, which pulls in `expo-modules-core`
// — real `expo-modules-core` touches RN-only globals (`__DEV__`) at import
// time outside a React Native runtime, so the module must be mocked before
// `../transactionStore` is imported below. Mirrors `SyncManager.test.ts`
// and `useTransactions.test.ts`'s `deleteTransactionAndEnqueue` test.
vi.mock('expo-localization', () => ({ getCalendars: () => [{ timeZone: 'UTC' }] }))

import {
  initDatabase,
  SCHEMA_VERSION,
  TRANSACTION_COLUMN_NAMES,
  __setDbForTests,
  type SchemaDb,
} from '../localDb'
import * as store from '../transactionStore'
import type { Transaction } from '@voice-expense/shared'

let DatabaseSync: typeof DatabaseSyncType | undefined
try {
  ;({ DatabaseSync } = await import('node:sqlite'))
} catch {
  DatabaseSync = undefined
}

/** Wraps node:sqlite in the async subset of the expo-sqlite API the app uses. */
interface Shim extends SchemaDb {
  raw: DatabaseSyncType
  runAsync(source: string, params?: unknown[]): Promise<void>
}

function openShim(path: string): Shim {
  const raw = new DatabaseSync!(path)
  return {
    raw,
    async execAsync(sql: string) {
      raw.exec(sql)
    },
    async runAsync(sql: string, params: unknown[] = []) {
      raw.prepare(sql).run(...(params as never[]))
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      return (raw.prepare(sql).get(...(params as never[])) as T | undefined) ?? null
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return raw.prepare(sql).all(...(params as never[])) as T[]
    },
  }
}

function columnNames(db: Shim): string[] {
  return (db.raw.prepare('PRAGMA table_info(transactions)').all() as { name: string }[])
    .map((c) => c.name)
    .sort()
}

function userVersion(db: Shim): number {
  return (db.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
}

function dedupIndexSql(db: Shim): string | null {
  const row = db.raw
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_txn_recurring_dedup'")
    .get() as { sql: string | null } | undefined
  return row?.sql ?? null
}

const MANIFEST_SORTED = [...TRANSACTION_COLUMN_NAMES].sort()

// The schema every current TestFlight install started from: pre-67b3858 —
// payment_method NOT NULL DEFAULT 'cash', no merchant_domain, no FX
// columns, no recurring_frequency, broad (008-mirror) dedup index.
const LEGACY_SCHEMA = `
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    direction TEXT NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    category_id TEXT,
    merchant TEXT,
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
  CREATE INDEX idx_txn_user_date ON transactions (user_id, transacted_at DESC);
  CREATE INDEX idx_txn_user_deleted ON transactions (user_id, is_deleted);
  CREATE UNIQUE INDEX idx_txn_recurring_dedup
    ON transactions (user_id, recurring_rule_id, substr(transacted_at, 1, 10))
    WHERE recurring_rule_id IS NOT NULL AND is_deleted = 0;
  CREATE TABLE sync_queue (
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
  CREATE INDEX idx_queue_entity ON sync_queue (entity_id);
`

// What the defective 67b3858 rebuild left behind: payment_method already
// loosened, merchant_domain present, but the FX columns it dropped are
// gone and recurring_frequency never existed.
const POST_DEFECTIVE_REBUILD_SCHEMA = LEGACY_SCHEMA.replace(
  "payment_method TEXT NOT NULL DEFAULT 'cash',",
  'payment_method TEXT,',
).replace('merchant TEXT,', 'merchant TEXT,\n    merchant_domain TEXT,')

function seedLegacyRows(db: Shim): void {
  const insert = db.raw.prepare(`
    INSERT INTO transactions (
      id, user_id, amount, direction, merchant, transacted_at, source,
      recurring_rule_id, client_id, client_created_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insert.run(
    'txn-plain',
    'user-1',
    12.5,
    'debit',
    'Cafe Luna',
    '2026-08-01T12:00:00.000Z',
    'voice',
    null,
    'txn-plain',
    '2026-08-01T12:00:00.000Z',
    '2026-08-01T12:00:00.000Z',
    '2026-08-01T12:00:00.000Z',
  )
  // Duplicate pair from a catch-up race: same (user, rule, date). The
  // legacy broad index only rejects live pairs, so seed the later one
  // deleted=0 and flip the earlier live too — both live is exactly the
  // corruption migration 008's window allowed before the index existed.
  db.raw.exec('DROP INDEX idx_txn_recurring_dedup')
  insert.run(
    'txn-rec-early',
    'user-1',
    9.99,
    'debit',
    'Netflix',
    '2026-08-02T09:00:00.000Z',
    'recurring_generated',
    'rule-1',
    'txn-rec-early',
    '2026-08-02T09:00:00.000Z',
    '2026-08-02T09:00:00.000Z',
    '2026-08-02T09:00:00.000Z',
  )
  insert.run(
    'txn-rec-late',
    'user-1',
    9.99,
    'debit',
    'Netflix',
    '2026-08-02T10:30:00.000Z',
    'recurring_generated',
    'rule-1',
    'txn-rec-late',
    '2026-08-02T10:30:00.000Z',
    '2026-08-02T10:30:00.000Z',
    '2026-08-02T10:30:00.000Z',
  )
}

function fullTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const now = '2026-08-09T08:00:00.000Z'
  return {
    id: 'txn-new',
    user_id: 'user-1',
    amount: 42.5,
    direction: 'debit',
    currency_code: 'EUR',
    category_id: null,
    merchant: 'Boulangerie',
    merchant_domain: null,
    note: 'croissants',
    // null payment_method is the exact value the legacy NOT NULL
    // constraint rejected — round-tripping it proves the rebuild ran.
    payment_method: null,
    amount_in_profile_currency: 46.13,
    fx_rate_to_profile: 1.0854,
    fx_rate_date: '2026-08-09',
    snapshot_currency: 'USD',
    transacted_at: now,
    local_day: '2026-08-09',
    occurrence_date: null,
    source: 'voice',
    raw_transcript: 'spent 42.50 at the boulangerie',
    ai_confidence: 0.93,
    is_recurring: false,
    recurring_rule_id: null,
    recurring_frequency: null,
    client_id: 'txn-new',
    client_created_at: now,
    version: 1,
    is_deleted: false,
    deleted_at: null,
    synced_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

async function assertUpsertRoundTrip(db: Shim, id: string): Promise<void> {
  __setDbForTests(db as unknown as SQLiteDatabase)
  try {
    const txn = fullTransaction({ id, client_id: id })
    await store.upsertTransaction(txn)
    const back = await store.getTransactionById(id)
    assert.ok(back, `${id}: row must come back`)
    assert.equal(back.amount_in_profile_currency, 46.13, `${id}: FX amount survives`)
    assert.equal(back.fx_rate_to_profile, 1.0854, `${id}: FX rate survives`)
    assert.equal(back.fx_rate_date, '2026-08-09', `${id}: FX date survives`)
    assert.equal(back.payment_method, null, `${id}: null payment_method accepted`)
    // Edit path: same id, higher version.
    await store.upsertTransaction(fullTransaction({ id, client_id: id, amount: 50, version: 2 }))
    const edited = await store.getTransactionById(id)
    assert.equal(edited!.amount, 50, `${id}: versioned upsert applies`)
  } finally {
    __setDbForTests(null)
  }
}

describe.skipIf(!DatabaseSync)('localDb migration path (node:sqlite)', () => {
  let tmp: string

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'localdb-migration-test-'))
  })

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('legacy pre-67b3858 install migrates without losing columns or rows', async () => {
    const db = openShim(join(tmp, 'legacy.db'))
    db.raw.exec(LEGACY_SCHEMA)
    seedLegacyRows(db)

    await initDatabase(db)

    expect(userVersion(db)).toBe(SCHEMA_VERSION)
    expect(columnNames(db)).toEqual(MANIFEST_SORTED)
    const pm = (db.raw.prepare('PRAGMA table_info(transactions)').all() as {
      name: string
      notnull: number
      dflt_value: string | null
    }[]).find((c) => c.name === 'payment_method')
    expect(pm?.notnull).toBe(0)
    expect(pm?.dflt_value).toBe(null)

    // Data survived the rebuild.
    const plain = db.raw.prepare("SELECT * FROM transactions WHERE id = 'txn-plain'").get() as {
      amount: number
      merchant: string
      payment_method: string
    }
    expect(plain.amount).toBe(12.5)
    expect(plain.merchant).toBe('Cafe Luna')
    expect(plain.payment_method).toBe('cash')

    // Dedup sweep kept the earlier occurrence, soft-deleted the later.
    const early = db.raw.prepare("SELECT is_deleted FROM transactions WHERE id = 'txn-rec-early'").get() as {
      is_deleted: number
    }
    const late = db.raw.prepare("SELECT is_deleted FROM transactions WHERE id = 'txn-rec-late'").get() as {
      is_deleted: number
    }
    expect(early.is_deleted).toBe(0)
    expect(late.is_deleted).toBe(1)

    // Narrowed dedup index in place and enforced.
    expect(dedupIndexSql(db) ?? '').toMatch(/recurring_generated/)

    // The "Done when": a full write round-trip in the SAME session,
    // through the real store code.
    await assertUpsertRoundTrip(db, 'txn-after-upgrade')

    // The unique index actually blocks a duplicate generated occurrence.
    __setDbForTests(db as unknown as SQLiteDatabase)
    try {
      await expect(
        store.upsertTransaction(
          fullTransaction({
            id: 'txn-rec-dup',
            client_id: 'txn-rec-dup',
            source: 'recurring_generated',
            recurring_rule_id: 'rule-1',
            transacted_at: '2026-08-02T23:00:00.000Z',
          }),
        ),
      ).rejects.toThrow()
    } finally {
      __setDbForTests(null)
    }

    // Relaunch: nothing replays, nothing changes.
    const before = (db.raw.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n
    await initDatabase(db)
    expect(userVersion(db)).toBe(SCHEMA_VERSION)
    expect((db.raw.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n).toBe(
      before,
    )
  })

  it('install hit by the defective rebuild gets its FX columns back', async () => {
    const db = openShim(join(tmp, 'defective.db'))
    db.raw.exec(POST_DEFECTIVE_REBUILD_SCHEMA)
    seedLegacyRows(db)

    await initDatabase(db)

    expect(userVersion(db)).toBe(SCHEMA_VERSION)
    expect(columnNames(db)).toEqual(MANIFEST_SORTED)
    await assertUpsertRoundTrip(db, 'txn-after-restore')
  })

  it('fresh install is stamped current and never replays migrations', async () => {
    const db = openShim(join(tmp, 'fresh.db'))
    await initDatabase(db)

    expect(userVersion(db)).toBe(SCHEMA_VERSION)
    expect(columnNames(db)).toEqual(MANIFEST_SORTED)
    expect(dedupIndexSql(db) ?? '').toMatch(/recurring_generated/)
    await assertUpsertRoundTrip(db, 'txn-fresh')

    // Second launch: idempotent.
    await initDatabase(db)
    expect(userVersion(db)).toBe(SCHEMA_VERSION)
  })
})
