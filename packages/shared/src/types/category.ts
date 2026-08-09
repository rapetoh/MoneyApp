import type { Database } from './database.types'

// The Row/Insert/Update shapes are re-exported directly — no narrowing
// needed beyond what database.types.ts already types by hand for the one
// CHECK-constrained column, `kind` (migration 022_category_kind.sql).
// `kind` mirrors `CategoryKind` in `packages/shared/src/domain/money.ts`
// by construction (same three literals); that module is the read side
// (`classifyFlow`/`isSpend`) and re-exports its own `CategoryKind` alias
// rather than importing this file, to avoid a domain -> types.category
// -> database.types import cycle. See database.types.ts for the full
// column list this is derived from.
export type Category = Database['public']['Tables']['categories']['Row']
export type CategoryInsert = Database['public']['Tables']['categories']['Insert']
export type CategoryUpdate = Database['public']['Tables']['categories']['Update'] & { id: string }
