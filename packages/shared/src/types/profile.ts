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
  created_at: string
  updated_at: string
}

export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>
