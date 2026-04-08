import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Category } from '@voice-expense/shared'

export function useCategories(userId: string | undefined) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('name')
    setCategories((data as Category[]) ?? [])
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

  return { categories, categoryMap, loading, createCategory, renameCategory, archiveCategory }
}
