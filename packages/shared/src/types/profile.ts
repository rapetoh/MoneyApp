import type { Locale } from '../i18n'
export type { Locale }

export interface Profile {
  id: string
  display_name: string | null
  currency_code: string
  locale: Locale
  voice_language: string // BCP-47 e.g. 'en-US', 'fr-FR'
  timezone: string
  monthly_income: number | null
  /** Employer / income source — used by MerchantAvatar to fetch a logo. */
  monthly_income_source: string | null
  /** Null until the user finishes (or skips) the onboarding flow. */
  onboarding_completed_at: string | null
  /** True when the user has opted in to anonymous usage analytics.
   *  Default false: we collect nothing unless asked. */
  analytics_opt_in: boolean
  /** True when the user allows pseudonymous crash logs (default).
   *  Operationally necessary to ship a stable native app; the user can
   *  turn it off from Settings → Privacy. */
  crash_reports_opt_in: boolean
  /** Plus entitlement state. `'active'` is the only value that
   *  unlocks gated surfaces; `'lapsed'` / `'free'` / NULL are all
   *  treated as free. Populated by IAP / RevenueCat receipt
   *  validation when that wires up; until then the column is NULL
   *  and per-platform dev hatches govern unlock. */
  plus_status: 'active' | 'lapsed' | 'free' | null
  created_at: string
  updated_at: string
}

export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>
