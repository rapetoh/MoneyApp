/**
 * Per-entity-type wiring for the drain and pull loop (fix-plan 1.6 point 6,
 * "All four entities"). `sync_operations.entity_type` — and this queue's
 * own `entity_type` column — have always listed `transaction`, `category`,
 * `budget` and `recurring_rule`; only `transaction` was ever wired end to
 * end. `SyncManager` now dispatches on `entry.entity_type` through this
 * registry instead of hard-coding `.from('transactions')`.
 *
 * `transaction` keeps a bespoke handler: it is the only entity with real
 * per-column write behaviour (the FX snapshot, the recurring-dedup index)
 * and the only one with a version-guarded RPC (`sync_upsert_transaction`,
 * migration 018) — PostgREST's `.upsert()` cannot express "only apply this
 * write if it is newer", so a table with real concurrent writers needs a
 * database function, not a REST call. `category`/`budget`/`recurring_rule`
 * get the same local sync contract and the same drain/pull mechanics
 * through the generic store (`genericLocalStore.ts`), ready for the hooks
 * that will start enqueueing them — none do yet in this build
 * (`useCategories`/`useBudget`/`useRecurringRules` are out of this item's
 * file ownership), so this registry entry is foundation, not adoption.
 */
import type { PostgrestError } from '@supabase/supabase-js'
import type { SyncEntityType, Transaction } from '@voice-expense/shared'
import { upsertTransaction } from './transactionStore'
import { CATEGORY_COLUMN_NAMES, BUDGET_COLUMN_NAMES, RECURRING_RULE_COLUMN_NAMES } from './localDb'
import { createGenericStore, toLocalRow } from './genericLocalStore'
import { supabaseAny } from './untypedClient'

export interface SyncErrorLike {
  code?: string | null
  message?: string | null
}

export interface PushResult {
  error: SyncErrorLike | null
}

export interface EntityHandler {
  /** Supabase table this entity pulls from. */
  table: string
  /** Merge a server row (pull or realtime) into the local cache. */
  applyRemoteRow(row: Record<string, unknown>): Promise<void>
  /** Send a queued create/update to the server. */
  push(operation: 'create' | 'update', payload: Record<string, unknown>): Promise<PushResult>
  /** Send a queued delete to the server, version-guarded. */
  pushDelete(payload: Record<string, unknown>): Promise<PushResult>
}

/**
 * Version-guarded soft delete shared by every entity: only flips
 * `is_deleted` when the incoming version is strictly newer than the
 * server's, mirroring the RPC's `WHERE EXCLUDED.version > version` guard
 * for the transaction path (fix-plan 1.6 point 7, "add the same predicate
 * to the delete branch"). An UPDATE whose WHERE clause matches zero rows
 * is not a Postgrest error — it means the version guard lost (or the row
 * is already gone), which is not a failure to retry forever: retrying an
 * already-lost race can never succeed, and the next pull reconciles
 * whatever the real state is.
 */
async function versionGuardedDelete(table: string, payload: Record<string, unknown>): Promise<PushResult> {
  const id = payload.id as string
  const userId = payload.user_id as string
  const version = payload.version as number
  const { error }: { error: PostgrestError | null } = await supabaseAny
    .from(table)
    .update({ is_deleted: true, version, deleted_at: payload.deleted_at ?? null })
    .eq('id', id)
    .eq('user_id', userId)
    .lt('version', version)
  return { error }
}

function buildGenericHandler(
  table: 'categories' | 'budgets' | 'recurring_rules',
  columnNames: readonly string[],
  booleanColumns: readonly string[],
): EntityHandler {
  const store = createGenericStore(table, columnNames)
  return {
    table,
    async applyRemoteRow(row) {
      await store.upsert(toLocalRow(row, columnNames, booleanColumns))
    },
    async push(_operation, payload) {
      // SyncManager strips synced_at (server-stamped by migration 018's
      // set_synced_at trigger) and raw_transcript before calling any
      // handler's push — one stripping point for every entity rather than
      // one per handler.
      const { error }: { error: PostgrestError | null } = await supabaseAny
        .from(table)
        .upsert(payload, { onConflict: 'user_id,client_id' })
      return { error }
    },
    async pushDelete(payload) {
      return versionGuardedDelete(table, payload)
    },
  }
}

export const ENTITY_HANDLERS: Record<SyncEntityType, EntityHandler> = {
  transaction: {
    table: 'transactions',
    async applyRemoteRow(row) {
      await upsertTransaction(row as Transaction)
    },
    async push(_operation, payload) {
      const { error }: { error: PostgrestError | null } = await supabaseAny.rpc('sync_upsert_transaction', {
        payload,
      })
      return { error }
    },
    async pushDelete(payload) {
      return versionGuardedDelete('transactions', payload)
    },
  },
  category: buildGenericHandler('categories', CATEGORY_COLUMN_NAMES, ['is_archived', 'is_deleted']),
  budget: buildGenericHandler('budgets', BUDGET_COLUMN_NAMES, ['is_active', 'is_deleted']),
  recurring_rule: buildGenericHandler('recurring_rules', RECURRING_RULE_COLUMN_NAMES, [
    'is_active',
    'is_deleted',
  ]),
}
