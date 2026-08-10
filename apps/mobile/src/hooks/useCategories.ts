import { useEffect, useState, useCallback } from 'react'
import * as Crypto from 'expo-crypto'
import { supabase } from '../lib/supabase'
import type { Category } from '@voice-expense/shared'

export function useCategories(userId: string | undefined) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  // Read-error exposure (fix-plan 2.13 / audit 08-F21 family): this fetch
  // used to discard `error` entirely and unconditionally overwrite
  // `categories` with `data ?? []`, so a failed read looked identical to
  // "you have no categories" everywhere this hook is consumed. On a
  // failed read the prior `categories` are left in place (still the most
  // honest thing to show) and `error` is set so a caller can render a
  // real error state with retry instead of a false empty state.
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data, error: fetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('name')
    if (fetchError) {
      setError(fetchError.message)
    } else {
      setCategories((data as Category[]) ?? [])
      setError(null)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetch()
  }, [fetch])

  async function createCategory(name: string, color?: string, icon?: string) {
    if (!userId) return null
    const { data, error } = await supabase
      .from('categories')
      .insert({
        user_id: userId,
        client_id: Crypto.randomUUID(),
        name: name.trim(),
        name_normalized: name.trim().toLowerCase(),
        color: color ?? null,
        icon: icon ?? null,
      })
      .select()
      .single()
    if (!error) await fetch()
    return error ? null : (data as Category)
  }

  async function renameCategory(id: string, name: string) {
    const { error } = await supabase
      .from('categories')
      .update({ name: name.trim(), name_normalized: name.trim().toLowerCase() })
      .eq('id', id)
    if (!error) await fetch()
    return !error
  }

  async function archiveCategory(id: string) {
    const { error } = await supabase
      .from('categories')
      .update({ is_archived: true })
      .eq('id', id)
    if (!error) await fetch()
    return !error
  }

  // Build a lookup map for quick name resolution
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  return { categories, categoryMap, loading, error, createCategory, renameCategory, archiveCategory }
}
