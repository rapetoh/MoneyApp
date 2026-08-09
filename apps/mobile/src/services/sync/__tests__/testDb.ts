/**
 * Shared `node:sqlite` test shim — wraps the same subset of the async
 * expo-sqlite API `localDb.ts`'s `SchemaDb` seam and the rest of the app's
 * SQLite call sites use, so every sync test in this directory runs the
 * REAL schema/store/queue code against a real (if in-process) SQLite
 * database instead of a hand-rolled fake. Not itself a `*.test.ts` file —
 * vitest's `include` glob (`src/**\/*.test.ts`) skips it.
 *
 * `node:sqlite` needs Node >= 22.5 (unflagged from Node 23.4 / backported
 * to later 22.x LTS points) — `DatabaseSync` is `undefined` on older Node,
 * and every test file importing this one guards with
 * `describe.skipIf(!DatabaseSync)`, matching `localDb.migration.test.ts`.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import type { SQLiteDatabase } from 'expo-sqlite'
import type { SchemaDb } from '../localDb'

export let DatabaseSync: typeof DatabaseSyncType | undefined
try {
  ;({ DatabaseSync } = await import('node:sqlite'))
} catch {
  DatabaseSync = undefined
}

/** Wraps node:sqlite in the async subset of the expo-sqlite API the app uses. */
export interface Shim extends SchemaDb {
  raw: DatabaseSyncType
  runAsync(source: string, params?: unknown[]): Promise<void>
}

export function openShim(path: string): Shim {
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

/** Casts a Shim to the `SQLiteDatabase` type `getDb()` returns, for `__setDbForTests`. */
export function asSqliteDatabase(db: Shim): SQLiteDatabase {
  return db as unknown as SQLiteDatabase
}

export function makeTempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
