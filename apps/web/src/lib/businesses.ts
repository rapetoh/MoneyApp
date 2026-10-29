'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Business } from '@voice-expense/shared'
import { createClient } from './supabase/client'

/**
 * The person's businesses (migration 044, docs/businesses.md). A transaction
 * whose `business_id` is null, or points at a business that no longer
 * exists, is Personal.
 */
export const PERSONAL = 'personal'

/** A filter value: 'all', 'personal', or a business id. */
export type BusinessFilter = 'all' | typeof PERSONAL | string

export function matchesBusiness(
  businessId: string | null | undefined,
  filter: BusinessFilter,
  known: ReadonlySet<string>,
): boolean {
  if (filter === 'all') return true
  const id = businessId && known.has(businessId) ? businessId : null
  return filter === PERSONAL ? id === null : id === filter
}

export function businessName(
  businessId: string | null | undefined,
  businesses: readonly Business[],
): string {
  return businesses.find((b) => b.id === businessId)?.name ?? 'Personal'
}

export function useBusinesses() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('businesses').select('*').order('name')
    setBusinesses((data ?? []) as Business[])
    setLoaded(true)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = useCallback(
    async (name: string): Promise<string | null> => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return 'Your session ended. Sign in again.'
      const { error } = await supabase
        .from('businesses')
        .insert({ user_id: user.id, name: name.trim() })
      if (error)
        return error.code === '23505'
          ? 'You already have a business with that name.'
          : error.message
      await reload()
      return null
    },
    [reload],
  )

  const rename = useCallback(
    async (id: string, name: string): Promise<string | null> => {
      const { error } = await createClient()
        .from('businesses')
        .update({ name: name.trim() })
        .eq('id', id)
      if (error)
        return error.code === '23505'
          ? 'You already have a business with that name.'
          : error.message
      await reload()
      return null
    },
    [reload],
  )

  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      const { error } = await createClient().rpc('delete_business', { p_business_id: id })
      if (error) return error.message
      await reload()
      return null
    },
    [reload],
  )

  /** Moves transactions to a business (null = Personal); returns the error, if any. */
  const assign = useCallback(async (ids: string[], businessId: string | null) => {
    const supabase = createClient()
    for (let i = 0; i < ids.length; i += 5000) {
      const { error } = await supabase.rpc('set_transactions_business', {
        p_ids: ids.slice(i, i + 5000),
        p_business_id: businessId,
      })
      if (error) return error.message
    }
    return null
  }, [])

  return { businesses, loaded, reload, create, rename, remove, assign }
}
