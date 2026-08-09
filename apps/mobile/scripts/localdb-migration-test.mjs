#!/usr/bin/env node
/**
 * Regression test for the local SQLite schema migration path
 * (audit 03-F3 / 06-F6: the table rebuild that dropped the FX columns
 * it had just added, breaking every write until relaunch).
 *
 * Runs the REAL schema core from src/services/sync/localDb.ts — and the
 * real transactionStore write path — against node:sqlite databases
 * seeded with the schema states shipped builds left in the field.
 *
 * No test harness exists in this repo yet; run directly:
 *   node apps/mobile/scripts/localdb-migration-test.mjs
 * When a test framework lands, adopt these cases as-is.
 */
import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Node strips types from .ts imports but does not add extensions to the
// app's extensionless relative imports — retry those with '.ts'.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      if (
        err?.code === 'ERR_MODULE_NOT_FOUND' &&
        (specifier.startsWith('./') || specifier.startsWith('../')) &&
        !specifier.endsWith('.ts')
      ) {
        return nextResolve(`${specifier}.ts`, context)
      }
      throw err
    }
  },
})

const here = dirname(fileURLToPath(import.meta.url))
const localDb = await import(pathToFileURL(join(here, '../src/services/sync/localDb.ts')).href)
const store = await import(
  pathToFileURL(join(here, '../src/services/sync/transactionStore.ts')).href
)

const { initDatabase, SCHEMA_VERSION, TRANSACTION_COLUMN_NAMES, __setDbForTests } = localDb

/** Wraps node:sqlite in the async subset of the expo-sqlite API the app uses. */
function openShim(path) {
  const raw = new DatabaseSync(path)
  return {
    raw,
    async execAsync(sql) {
      raw.exec(sql)
    },
    async runAsync(sql, params = []) {
      raw.prepare(sql).run(...params)
    },
    async getFirstAsync(sql, params = []) {
      return raw.prepare(sql).get(...params) ?? null
    },
    async getAllAsync(sql, params = []) {
      return raw.prepare(sql).all(...params)
    },
  }
}

function columnNames(db) {
  return db.raw
    .prepare('PRAGMA table_info(transactions)')
    .all()
    .map((c) => c.name)
    .sort()
}

function userVersion(db) {
  return db.raw.prepare('PRAGMA user_version').get().user_version
}

function dedupIndexSql(db) {
  const row = db.raw
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_txn_recurring_dedup'",
    )
    .get()
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

function seedLegacyRows(db) {
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

function fullTransaction(overrides = {}) {
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
    transacted_at: now,
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

async function assertUpsertRoundTrip(db, id) {
  __setDbForTests(db)
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
    assert.equal(edited.amount, 50, `${id}: versioned upsert applies`)
  } finally {
    __setDbForTests(null)
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'localdb-migration-test-'))
let failed = false

async function scenario(name, fn) {
  try {
    await fn()
    console.log(`ok   ${name}`)
  } catch (err) {
    failed = true
    console.error(`FAIL ${name}`)
    console.error(err)
  }
}

await scenario('legacy pre-67b3858 install migrates without losing columns or rows', async () => {
  const db = openShim(join(tmp, 'legacy.db'))
  db.raw.exec(LEGACY_SCHEMA)
  seedLegacyRows(db)

  await initDatabase(db)

  assert.equal(userVersion(db), SCHEMA_VERSION, 'user_version stamped')
  assert.deepEqual(columnNames(db), MANIFEST_SORTED, 'column set is exactly the manifest')
  const pm = db.raw
    .prepare('PRAGMA table_info(transactions)')
    .all()
    .find((c) => c.name === 'payment_method')
  assert.equal(pm.notnull, 0, 'payment_method NOT NULL dropped')
  assert.equal(pm.dflt_value, null, "payment_method DEFAULT 'cash' dropped")

  // Data survived the rebuild.
  const plain = db.raw.prepare("SELECT * FROM transactions WHERE id = 'txn-plain'").get()
  assert.equal(plain.amount, 12.5)
  assert.equal(plain.merchant, 'Cafe Luna')
  assert.equal(plain.payment_method, 'cash')

  // Dedup sweep kept the earlier occurrence, soft-deleted the later.
  const early = db.raw
    .prepare("SELECT is_deleted FROM transactions WHERE id = 'txn-rec-early'")
    .get()
  const late = db.raw.prepare("SELECT is_deleted FROM transactions WHERE id = 'txn-rec-late'").get()
  assert.equal(early.is_deleted, 0)
  assert.equal(late.is_deleted, 1)

  // Narrowed dedup index in place and enforced.
  assert.match(dedupIndexSql(db) ?? '', /recurring_generated/)

  // The "Done when": a full write round-trip in the SAME session,
  // through the real store code.
  await assertUpsertRoundTrip(db, 'txn-after-upgrade')

  // The unique index actually blocks a duplicate generated occurrence.
  __setDbForTests(db)
  try {
    await assert.rejects(
      store.upsertTransaction(
        fullTransaction({
          id: 'txn-rec-dup',
          client_id: 'txn-rec-dup',
          source: 'recurring_generated',
          recurring_rule_id: 'rule-1',
          transacted_at: '2026-08-02T23:00:00.000Z',
        }),
      ),
      'dedup index must reject a second live generated occurrence',
    )
  } finally {
    __setDbForTests(null)
  }

  // Relaunch: nothing replays, nothing changes.
  const before = db.raw.prepare('SELECT count(*) AS n FROM transactions').get().n
  await initDatabase(db)
  assert.equal(userVersion(db), SCHEMA_VERSION)
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM transactions').get().n, before)
})

await scenario('install hit by the defective rebuild gets its FX columns back', async () => {
  const db = openShim(join(tmp, 'defective.db'))
  db.raw.exec(POST_DEFECTIVE_REBUILD_SCHEMA)
  seedLegacyRows(db)

  await initDatabase(db)

  assert.equal(userVersion(db), SCHEMA_VERSION)
  assert.deepEqual(columnNames(db), MANIFEST_SORTED, 'FX + recurring_frequency columns restored')
  await assertUpsertRoundTrip(db, 'txn-after-restore')
})

await scenario('fresh install is stamped current and never replays migrations', async () => {
  const db = openShim(join(tmp, 'fresh.db'))
  await initDatabase(db)

  assert.equal(userVersion(db), SCHEMA_VERSION)
  assert.deepEqual(columnNames(db), MANIFEST_SORTED)
  assert.match(dedupIndexSql(db) ?? '', /recurring_generated/)
  await assertUpsertRoundTrip(db, 'txn-fresh')

  // Second launch: idempotent.
  await initDatabase(db)
  assert.equal(userVersion(db), SCHEMA_VERSION)
})

rmSync(tmp, { recursive: true, force: true })
if (failed) process.exit(1)
console.log('all scenarios passed')
