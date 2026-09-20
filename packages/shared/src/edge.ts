/**
 * The Edge Function surface of `@voice-expense/shared`.
 *
 * `index.ts` is the apps' entry point and exports everything: React-facing
 * helpers, export formatters, brand constants, the whole i18n table. Edge
 * Functions need a fraction of that, and bundling the rest ships dead code
 * to a cold-starting Deno isolate on every invocation.
 *
 * So the generated Deno bundle (scripts/build-shared-deno.mjs) is built
 * from THIS file instead, and this file is the explicit contract for what
 * the server is allowed to depend on. Adding an export here is a decision,
 * not an accident: it says the server now runs that logic too, and that it
 * must stay identical to what the apps render.
 *
 * `sharedDenoBundle.test.ts` asserts every symbol the functions import is
 * present, so removing something here that a function still calls fails a
 * test rather than a 06:00 cron run.
 */

// Notification engine: what to say and whether to say it.
export {
  planNotifications,
  govern,
  inQuietHours,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationCandidate,
  type NotificationFamily,
  type NotificationUrgency,
  type NotificationPrefs,
  type NotificationPlanInput,
  type NotificationPlusState,
  type GovernorState,
} from './domain/notifications'

// The engines it reasons with, also called directly by generate-recurring.
export { budgetStatus } from './domain/budget'
export { computeAskInsights } from './domain/askInsights'
export {
  occurrencesDue,
  occurrencesInWindow,
  firstOccurrenceOnOrAfter,
  nextOccurrence,
} from './domain/recurrence'

// Civil-date primitives: every window the engines open is a local day in
// the user's zone, never a UTC slice.
export { localDay, localParts, monthBounds, addDays, civilDateTimeToInstant } from './utils/period'
export { roundCents } from './utils/currency'

// Localised copy. The sweep sends in the user's own language.
export { t, type Locale } from './i18n'
