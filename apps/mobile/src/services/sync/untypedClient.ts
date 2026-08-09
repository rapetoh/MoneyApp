/**
 * A handful of calls in this outbox — the `categories`/`budgets`/
 * `recurring_rules` upsert and version-guarded update, the
 * `sync_upsert_transaction` RPC, and `pullRemote`'s generic
 * per-entity-type `select` — target tables/columns/a function that exist
 * from migration 018 onward but not yet in the generated `Database` type.
 * That file is produced from the *live* schema (see its own header
 * comment) and this fix-plan stage deliberately does not apply migrations
 * to production, so it cannot see them yet. Regenerating
 * `database.types.ts` once 018/019 are applied removes the need for this
 * cast; every call site through it still gets its `data`/`error` shape
 * checked because the call site annotates the awaited result, not this
 * module.
 */
import { supabase } from '../../lib/supabase'

export const supabaseAny = supabase as unknown as {
  from(table: string): any
  rpc(fn: string, args?: Record<string, unknown>): any
}
