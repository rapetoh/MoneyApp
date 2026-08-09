import type { Locale } from '../i18n'
import type { Database } from './database.types'
export type { Locale }

type ProfileRow = Database['public']['Tables']['profiles']['Row']

/** `locale` and `plus_status` carry CHECK constraints the generated type
 *  can't see (codegen reads column types, not constraints) — narrowed to
 *  their literal unions here. Every other column, including the
 *  `voice_language` / `monthly_income_source` / `onboarding_completed_at` /
 *  `analytics_opt_in` / `crash_reports_opt_in` fields this used to spell
 *  out by hand, flows straight from the generated Row: see
 *  database.types.ts for the column list this is derived from. */
export type Profile = Omit<ProfileRow, 'locale' | 'plus_status'> & {
  locale: Locale
  /** Plus entitlement state. `'active'` is the only value that
   *  unlocks gated surfaces; `'lapsed'` / `'free'` / NULL are all
   *  treated as free. Populated by IAP / RevenueCat receipt
   *  validation when that wires up; until then the column is NULL
   *  and per-platform dev hatches govern unlock. */
  plus_status: 'active' | 'lapsed' | 'free' | null
}

export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>
