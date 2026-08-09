#!/usr/bin/env bash
# Regenerates packages/shared/src/types/database.types.ts from the live
# Supabase schema (fix-plan 1.2). Run this after every new migration lands.
#
# Requires the `supabase` CLI (fetched on demand via npx, nothing to
# install) and a SUPABASE_ACCESS_TOKEN in the environment — a personal or
# CI access token from https://supabase.com/dashboard/account/tokens.
# Never the anon key or the service-role key: this only reads schema
# metadata via the Management API, never table data.
set -euo pipefail

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "SUPABASE_ACCESS_TOKEN is not set — see this script's header." >&2
  exit 1
fi

cd "$(dirname "$0")/.."

PROJECT_ID="${SUPABASE_PROJECT_ID:-ohaqhwampmyoeaopdybd}"

npx --yes supabase@2 gen types typescript \
  --project-id "$PROJECT_ID" \
  --schema public \
  > src/types/database.types.ts.tmp

# Re-apply the generated-file header this repo prepends — `supabase gen
# types` only emits the type body, not our provenance comment.
{
  cat <<'HEADER'
// ============================================================
// GENERATED FILE — do not hand-edit.
//
// Produced by `supabase gen types typescript` against the live schema
// (project ohaqhwampmyoeaopdybd), which matches supabase/migrations/
// 001-016 exactly (verified via `list_migrations` at generation time —
// no drift between the repo's migration files and what's applied).
//
// Regenerate with `packages/shared/scripts/gen-db-types.sh` (needs the
// `supabase` CLI + a `SUPABASE_ACCESS_TOKEN`, never the anon/service key)
// whenever a new migration lands. CI (`.github/workflows/ci.yml`, job
// `db-types`) regenerates and diffs this file on every push so a migration
// that isn't reflected here fails the build instead of drifting silently
// (fix-plan 1.2).
//
// This file is the single source of truth for every table's Row/Insert/
// Update shape. Hand-written domain types in this directory (transaction.ts,
// profile.ts, category.ts, budget.ts, recurring.ts) are now derived from
// here — narrowing the CHECK-constrained `string` columns (codegen can't
// see CHECK constraints, only column types) to the app's literal unions.
// Renaming or removing a column here without updating those files, or any
// query that names it, is a compile error — see
// packages/shared/src/types/__tests__/database.types.test.ts.
// ============================================================

HEADER
  cat src/types/database.types.ts.tmp
} > src/types/database.types.ts

rm src/types/database.types.ts.tmp

echo "Wrote src/types/database.types.ts"
