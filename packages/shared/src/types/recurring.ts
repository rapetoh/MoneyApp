import type { Database } from './database.types'

export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

// `direction` and `frequency` carry CHECK constraints the generated type
// can't see, so they come back as bare `string` — narrowed here.
// `payment_method` is left as the generic `string | null` the column
// actually is at the type level, matching the original hand-written shape.
// Rules are created server-side by the link_or_create_recurring_rule
// trigger (migration 013/014), not by a client insert — no Insert/Update
// alias is exported here for the same reason none existed before.
export type RecurringRule = Omit<
  Database['public']['Tables']['recurring_rules']['Row'],
  'direction' | 'frequency'
> & {
  direction: 'debit' | 'credit'
  frequency: RecurringFrequency
}
