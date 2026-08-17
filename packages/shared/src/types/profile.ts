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
export type Profile = Omit<ProfileRow, 'locale' | 'plus_status' | 'plus_period_type'> & {
  locale: Locale
  /** Plus entitlement state. `'active'` is the only value that unlocks
   *  gated surfaces (it includes the free-trial period); `'lapsed'` /
   *  `'free'` / NULL are all treated as free. Written only by the server
   *  from RevenueCat (supabase/functions/revenuecat-webhook, plus-sync);
   *  migration 031's trigger refuses client writes. The sibling
   *  `plus_product_id` / `plus_expires_at` / `plus_will_renew` / … columns
   *  describe the subscription for Settings — see `describePlus()` in
   *  ../plus.ts. */
  plus_status: 'active' | 'lapsed' | 'free' | null
  plus_period_type: 'trial' | 'intro' | 'normal' | null
}

/** Client-writable profile fields. The `plus_*` entitlement columns are
 *  excluded at the type level as well as by the database trigger. */
export type ProfileUpdate = Partial<
  Omit<
    Profile,
    | 'id'
    | 'created_at'
    | 'updated_at'
    | 'plus_status'
    | 'plus_product_id'
    | 'plus_period_type'
    | 'plus_expires_at'
    | 'plus_will_renew'
    | 'plus_store'
    | 'plus_is_sandbox'
    | 'plus_synced_at'
  >
>
