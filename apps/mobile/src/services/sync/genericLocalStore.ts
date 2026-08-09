/**
 * Generic local-table CRUD for the sync-contract entities that share the
 * same shape as `transactions` (`client_id`, `version`, `is_deleted`,
 * `synced_at`) but have no per-column write behaviour of their own yet —
 * unlike `transactions`, which recomputes an FX snapshot and enforces the
 * recurring-dedup index on write. `transactionStore.ts` stays hand-written
 * for that reason; categories/budgets/recurring_rules do not need three
 * near-identical copies of the same INSERT/UPSERT/SELECT boilerplate, so
 * one factory is instantiated per table instead (fix-plan 1.6 point 6).
 *
 * `tableName` is always one of this module's own fixed constants, never
 * user input, so the interpolation below carries no injection risk.
 */
import type { SQLiteBindValue } from 'expo-sqlite'
import { getDb } from './localDb'

export interface GenericRow {
  [column: string]: SQLiteBindValue
}

export interface GenericStore {
  upsert(row: GenericRow): Promise<void>
  softDelete(id: string): Promise<void>
  getAll(userId: string): Promise<Record<string, unknown>[]>
  getById(id: string): Promise<Record<string, unknown> | null>
}

const IMMUTABLE_ON_CONFLICT = new Set(['id', 'user_id', 'client_id', 'created_at'])

export function createGenericStore(tableName: string, columnNames: readonly string[]): GenericStore {
  const columnList = columnNames.join(', ')
  const placeholders = columnNames.map(() => '?').join(', ')
  const setList = columnNames
    .filter((name) => !IMMUTABLE_ON_CONFLICT.has(name))
    .map((name) => `${name} = excluded.${name}`)
    .join(', ')

  return {
    async upsert(row) {
      const db = await getDb()
      await db.runAsync(
        `INSERT INTO ${tableName} (${columnList})
         VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${setList}
         WHERE excluded.version >= ${tableName}.version`,
        columnNames.map((name) => row[name] ?? null),
      )
    },
    async softDelete(id) {
      const db = await getDb()
      const now = new Date().toISOString()
      await db.runAsync(
        `UPDATE ${tableName} SET is_deleted = 1, updated_at = ?, version = version + 1 WHERE id = ?`,
        [now, id],
      )
    },
    async getAll(userId) {
      const db = await getDb()
      return (await db.getAllAsync(
        `SELECT * FROM ${tableName} WHERE user_id = ? AND is_deleted = 0`,
        [userId],
      )) as Record<string, unknown>[]
    },
    async getById(id) {
      const db = await getDb()
      const row = await db.getFirstAsync(`SELECT * FROM ${tableName} WHERE id = ?`, [id])
      return (row as Record<string, unknown> | null) ?? null
    },
  }
}

/**
 * Converts a Postgres row (booleans as real booleans, e.g. from
 * `pullRemote` or a realtime payload) into SQLite bind values (booleans
 * as 0/1) for the given column manifest. Any manifest column absent from
 * `row` binds as NULL rather than throwing — a server row is a `select
 * ('*')` superset in the common case, but this keeps a partial payload
 * (e.g. a realtime `UPDATE` event carrying only changed columns) safe too.
 */
export function toLocalRow(
  row: Record<string, unknown>,
  columnNames: readonly string[],
  booleanColumns: readonly string[],
): GenericRow {
  const isBoolean = new Set(booleanColumns)
  const out: GenericRow = {}
  for (const name of columnNames) {
    const value = row[name]
    out[name] = isBoolean.has(name) ? (value ? 1 : 0) : ((value ?? null) as SQLiteBindValue)
  }
  return out
}
