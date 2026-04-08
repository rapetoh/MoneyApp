import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, ProfileUpdate } from '@voice-expense/shared'

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data as Profile | null)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetch()
  }, [fetch])

  async function updateProfile(updates: ProfileUpdate) {
    if (!userId) return false
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
    if (!error) await fetch()
    return !error
  }

  return { profile, loading, updateProfile, refetch: fetch }
}
