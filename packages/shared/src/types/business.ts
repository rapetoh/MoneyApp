import type { Database } from './database.types'

/** A side business the person keeps apart from their personal spending
 *  (migration 044). A transaction with no business is Personal. */
export type Business = Database['public']['Tables']['businesses']['Row']
