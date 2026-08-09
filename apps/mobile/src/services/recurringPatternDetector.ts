/**
 * Thin re-export. The real implementation now lives in
 * `packages/shared/src/domain/recurringPatternDetector.ts` (fix-plan
 * 1.5 — "one pattern detector"), which merges this file with its web
 * twin (`apps/web/src/lib/recurringPatternDetector.ts`). The two were a
 * hand-maintained copy-paste pair kept in sync by hand. `app/(tabs)/
 * index.tsx` and `src/components/RecurringPatternBanner.tsx` keep
 * importing from this path so the re-export, not a call-site sweep, is
 * the change.
 */
export { detectRecurringPatterns, type RecurringPatternCandidate } from '@voice-expense/shared'
