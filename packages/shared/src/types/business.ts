import type { Database } from './database.types'
import type { BusinessIconKey } from '../domain/businessIcon'

type BusinessRow = Database['public']['Tables']['businesses']['Row']

/** A side business the person keeps apart from their personal spending
 *  (migration 044). A transaction with no business is Personal.
 *
 *  `logo` and `icon` (migration 045) are optional: a list cached on a phone
 *  before 045, or read from a server where 045 has not run yet, has
 *  neither. Draw a business with `businessIcon()` / `isBusinessLogo()` so
 *  a missing value falls back to the icon its name suggests. */
export type Business = Omit<BusinessRow, 'logo' | 'icon'> & {
  /** `data:image/(png|jpeg|webp);base64,...`, at most 200,000 characters. */
  logo?: string | null
  icon?: BusinessIconKey | null
}
