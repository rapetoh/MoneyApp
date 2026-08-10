/**
 * The one `TransactionSource` → display-label map — fix-plan item 2.12
 * ("A source column that reports the source"). The user asked directly:
 * "is recurring a source? can I not see the real source?" Before this,
 * web's Transactions page derived a label inline (`classifySource` in
 * `apps/web/src/app/dashboard/transactions/page.tsx`, fixed for the
 * `is_recurring`-ahead-of-`source` defect in commit 09f7a7a) and mobile's
 * transaction detail screen (`apps/mobile/app/transaction/[id].tsx`'s
 * `humanSource`) hand-rolled a second, differently-worded map from the
 * same six enum values — "Manual"/"Receipt scan"/"Apple Pay Shortcut"/
 * "Payment notification"/"Recurring · auto-generated" where web reads
 * "Typed"/"Scan"/"Apple Pay"/"Apple Pay"/"Auto". This module is the
 * single source both are meant to converge on, so `sourceLabel` returns
 * the same string on both platforms (this item's "done when").
 *
 * `shortcut` and `notification_listener` collapse into one `'apple-pay'`
 * bucket — both are "a wallet-tap detected automatically", and that is
 * the distinction a user cares about, not which OS API produced it.
 * Recurrence is a different fact (`is_recurring` / the transaction's own
 * `recurring_rule_id`) and is never folded in here — a `manual` row
 * marked recurring is still "Typed", shown alongside its own repeat
 * glyph, never a "Recurring" source.
 */
import type { TransactionSource } from '../types/transaction'

export type SourceKind = 'voice' | 'typed' | 'scan' | 'apple-pay' | 'auto'

/** `TransactionSource` → the coarser bucket used for filtering/grouping
 *  (e.g. the Transactions page's SOURCE filter chips). */
export function classifySourceKind(source: TransactionSource): SourceKind {
  switch (source) {
    case 'voice':
      return 'voice'
    case 'scan':
      return 'scan'
    case 'shortcut':
    case 'notification_listener':
      return 'apple-pay'
    case 'recurring_generated':
      return 'auto'
    case 'manual':
    default:
      return 'typed'
  }
}

const KIND_LABEL: Record<SourceKind, string> = {
  voice: 'Voice',
  typed: 'Typed',
  scan: 'Scanned',
  'apple-pay': 'Apple Pay',
  auto: 'Auto',
}

/** The one label every surface should render for a transaction's
 *  `source` column. Not locale-aware (mirrors `classifySource`'s
 *  English-only labels on web today) — routing this through `t()` is
 *  future work, not part of this item's "same string on both
 *  platforms" contract. */
export function sourceLabel(source: TransactionSource): string {
  return KIND_LABEL[classifySourceKind(source)]
}
