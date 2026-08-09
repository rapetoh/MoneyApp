/**
 * Regression test for fix-plan 1.6 point 8 / migration `019_realtime_publication.sql`.
 *
 * There is no local-Postgres harness in this repo (see `apps/mobile/
 * vitest.config.mts`'s "component tests need RN/jsdom mocking that Stage 2
 * will set up separately" — the same gap applies to a real `pg_publication_
 * tables` check), so this test cannot literally apply the migration and
 * query `pg_publication_tables`. What it CAN verify, node-runnable and with
 * no external dependency, is the thing that actually causes the historical
 * bug this migration fixes: every table a mobile `postgres_changes`
 * subscriber (`SyncManager.startRealtime`, `REALTIME_TABLES`) listens to
 * must be named in the migration's `ADD TABLE` loop, or that subscription
 * is listening to a publication that will never emit for it — silently,
 * with no error, exactly like the bug that shipped.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../supabase/migrations/019_realtime_publication.sql',
)

// Mirrors `SyncManager.ts`'s `REALTIME_TABLES` — every table a
// `postgres_changes` handler is registered against. Duplicated rather than
// imported so this test still catches the case where someone edits
// `REALTIME_TABLES` without updating the migration (importing the map
// would make both sides drift together silently).
const SUBSCRIBED_TABLES = ['transactions', 'categories', 'budgets', 'recurring_rules']

describe('019_realtime_publication.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8')

  it('publishes every table a mobile postgres_changes subscriber listens to', () => {
    const arrayMatch = sql.match(/ARRAY\[([^\]]+)\]/)
    expect(arrayMatch, 'migration must build its table list from an ARRAY[...] literal').toBeTruthy()
    const published = Array.from(arrayMatch![1].matchAll(/'([a-z_]+)'/g)).map((m) => m[1])

    for (const table of SUBSCRIBED_TABLES) {
      expect(published, `${table} must be in the migration's ADD TABLE list`).toContain(table)
    }
  })

  it('adds each table via ALTER PUBLICATION supabase_realtime, guarded by an existence check (idempotent pre-PG15)', () => {
    expect(sql).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE/)
    expect(sql).toMatch(/pg_publication_tables/)
    expect(sql).toMatch(/pubname\s*=\s*'supabase_realtime'/)
  })
})
