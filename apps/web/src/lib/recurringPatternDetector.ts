/**
 * Thin re-export. The real implementation now lives in
 * `packages/shared/src/domain/recurringPatternDetector.ts` (fix-plan
 * 1.5 — "one pattern detector"), which merges this file with its mobile
 * twin (`apps/mobile/src/services/recurringPatternDetector.ts`). The two
 * were a hand-maintained copy-paste pair — this file's own previous
 * header read *"Web mirror of apps/mobile/src/services/
 * recurringPatternDetector.ts... If the mobile detector is updated,
 * copy the change over here"*, an admission the drift was expected.
 * `dashboard/recurring/page.tsx` keeps importing from this path so the
 * re-export, not a call-site sweep, is the change.
 */
export { detectRecurringPatterns, type RecurringPatternCandidate } from '@voice-expense/shared'
