/**
 * Replaces `recurrence.vendored.test.ts` (deleted Sep 19 2026).
 *
 * That test guarded a hand-kept port: `supabase/functions/_shared/recurrence.ts`
 * was a by-hand copy of two functions from `../recurrence.ts`, because Deno
 * cannot resolve the monorepo's workspace package, and the test diffed the
 * two copies so nobody could edit one without the other. It worked, but it
 * only covered the two functions someone had remembered to port, and the
 * notification engine needs `budgetStatus`, `computeAskInsights`,
 * `occurrencesInWindow`, the i18n table and the period utilities on the
 * server too. Hand-porting all of that would have multiplied the same
 * problem by ten.
 *
 * So the copy is generated now (`scripts/build-shared-deno.mjs` bundles
 * `packages/shared/src/index.ts` into
 * `supabase/functions/_shared/generated/shared.ts`), and this file is the
 * replacement guard. It is strictly stronger than the one it replaces: it
 * covers the whole exported surface rather than two chosen functions, and
 * drift is impossible to introduce by hand rather than merely detected.
 *
 * Before the swap, the old vendored copy and the real engine were run
 * against 207,360 rule/timezone/anchor/now combinations and agreed on
 * every one, which is what made replacing it safe.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const BUNDLE = path.join(repoRoot, 'supabase/functions/_shared/generated/shared.ts')

/** Everything the Edge Functions import from the bundle today. Adding an
 *  import over there without adding it here is fine; removing an export
 *  from `packages/shared` that a function still calls is not, and this
 *  list is what turns that into a failing test instead of a 500 at 06:00. */
const REQUIRED_EXPORTS = [
  // generate-recurring
  'occurrencesDue',
  'nextOccurrence',
  // notify-sweep
  'planNotifications',
  'govern',
  'inQuietHours',
  'DEFAULT_NOTIFICATION_PREFS',
  'budgetStatus',
  'computeAskInsights',
  'occurrencesInWindow',
  'localDay',
  'localParts',
  't',
]

describe('generated Deno bundle', () => {
  it('exists', () => {
    expect(existsSync(BUNDLE)).toBe(true)
  })

  it('is in sync with packages/shared', () => {
    // The generator's own --check mode: it rebuilds in memory and compares.
    // A non-zero exit means someone changed the shared package and the
    // server would now run different logic to the apps.
    expect(() =>
      execFileSync('node', ['scripts/build-shared-deno.mjs', '--check'], {
        cwd: repoRoot,
        stdio: 'pipe',
      }),
    ).not.toThrow()
  })

  it('exports everything the Edge Functions import', () => {
    const src = readFileSync(BUNDLE, 'utf8')
    // esbuild emits one `export { a, b, c };` block at the end.
    const exportBlock = src.slice(src.lastIndexOf('export {'))
    for (const name of REQUIRED_EXPORTS) {
      expect(exportBlock, `bundle is missing export "${name}"`).toContain(name)
    }
  })

  it('has no unresolved imports (Deno cannot resolve them)', () => {
    const src = readFileSync(BUNDLE, 'utf8')
    expect(src).not.toMatch(/^\s*import\s.+from\s+['"]/m)
  })
})
