import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Business } from '@voice-expense/shared'
import { supabase } from '../lib/supabase'
import { useCachedState, cacheHas } from '../services/queryCache'
import { getDb } from '../services/sync/localDb'
import { DataEvents } from '../events/dataEvents'

const EMPTY: Business[] = []
const metaKey = (userId: string) => `businesses:${userId}`

/** The list as last stored on the device: what a cold start (a Siri
 *  sentence with the app closed) has before the hook has loaded. */
export async function readCachedBusinesses(userId: string): Promise<Business[]> {
  try {
    const db = await getDb()
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM sync_meta WHERE key = ?',
      [metaKey(userId)],
    )
    const stored = row ? (JSON.parse(row.value) as unknown) : null
    return Array.isArray(stored) ? (stored as Business[]) : []
  } catch {
    return []
  }
}

/**
 * The person's businesses (Supabase migration 044, docs/businesses.md).
 * A transaction with no business, or one pointing at a business that no
 * longer exists, is Personal.
 *
 * Read from the server and kept on the device (sync_meta), so the voice
 * prompt and the pickers still know the businesses offline or on a cold
 * launch before the network answers.
 */
export function useBusinesses(userId: string | undefined) {
  const [businesses, setBusinesses] = useCachedState<Business[]>(
    userId ? `businesses:${userId}` : null,
    EMPTY,
  )
  const [error, setError] = useState<string | null>(null)

  const persist = useCallback(async (uid: string, list: Business[]) => {
    try {
      const db = await getDb()
      await db.runAsync('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [
        metaKey(uid),
        JSON.stringify(list),
      ])
    } catch {
      /* the in-memory copy still serves this session */
    }
  }, [])

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data, error: e } = await supabase.from('businesses').select('*').order('name')
    if (e) {
      setError(e.message)
      return
    }
    const list = (data ?? []) as Business[]
    setBusinesses(list)
    setError(null)
    void persist(userId, list)
  }, [userId, setBusinesses, persist])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      const stored = await readCachedBusinesses(userId)
      // Only fills an empty cache: a fresher server answer always wins.
      if (!cancelled && stored.length > 0 && !cacheHas(`businesses:${userId}`)) {
        setBusinesses(stored)
      }
      await fetch()
    })()
    return () => {
      cancelled = true
    }
  }, [userId, fetch, setBusinesses])

  async function create(name: string): Promise<string | null> {
    if (!userId) return 'not_signed_in'
    const { error: e } = await supabase
      .from('businesses')
      .insert({ user_id: userId, name: name.trim() })
    if (e) return e.code === '23505' ? 'duplicate' : e.message
    await fetch()
    return null
  }

  async function rename(id: string, name: string): Promise<string | null> {
    const { error: e } = await supabase
      .from('businesses')
      .update({ name: name.trim() })
      .eq('id', id)
    if (e) return e.code === '23505' ? 'duplicate' : e.message
    await fetch()
    return null
  }

  /** Deletes the business; the server moves its transactions to Personal
   *  (with a version bump, so the next pull brings them down). */
  async function remove(id: string): Promise<string | null> {
    const { error: e } = await supabase.rpc('delete_business', { p_business_id: id })
    if (e) return e.message
    await fetch()
    if (userId) DataEvents.emitTransactions(userId)
    return null
  }

  const byId = useMemo(() => new Map(businesses.map((b) => [b.id, b])), [businesses])

  return { businesses, byId, error, refetch: fetch, create, rename, remove }
}
