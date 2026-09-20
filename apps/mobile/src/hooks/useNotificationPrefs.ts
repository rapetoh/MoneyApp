import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '@voice-expense/shared'

/**
 * The user's notification preferences, per family plus quiet hours and a
 * weekly ceiling.
 *
 * Server-stored, not device-stored, for the reason the whole system is
 * server-side: the sweep is what decides whether to send, and it runs
 * while the phone is asleep. A preference kept in SecureStore would be
 * invisible to it. It also means turning recaps off on the iPhone turns
 * them off everywhere, which is what anyone would expect.
 *
 * Absent row means defaults. The row is created on first write rather
 * than at signup, so the table stays empty for everyone who never opens
 * this screen and the sweep's read stays a miss on an indexed primary key.
 */
export function useNotificationPrefs(userId: string | undefined) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    let alive = true
    supabase
      .from('notification_prefs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (data) {
          setPrefs({
            receipts: data.receipts,
            bills: data.bills,
            budget: data.budget,
            insights: data.insights,
            habit: data.habit,
            quiet_start: data.quiet_start,
            quiet_end: data.quiet_end,
            max_per_week: data.max_per_week,
          })
        }
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [userId])

  /**
   * Optimistic, and deliberately so: a switch that waits on the network
   * to move feels broken. A failed write rolls the switch back rather
   * than leaving the screen disagreeing with the server.
   */
  const update = useCallback(
    async (patch: Partial<NotificationPrefs>) => {
      if (!userId) return false
      const previous = prefs
      const next = { ...prefs, ...patch }
      setPrefs(next)
      const { error } = await supabase
        .from('notification_prefs')
        .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) {
        setPrefs(previous)
        return false
      }
      return true
    },
    [userId, prefs],
  )

  return { prefs, loading, update }
}
