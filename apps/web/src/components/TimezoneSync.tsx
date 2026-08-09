'use client'
import { useEffect } from 'react'
import { createClient } from '../lib/supabase/client'

/**
 * Web/desktop counterpart to `apps/mobile/src/hooks/useProfile.ts`'s
 * `captureDeviceTimezone` — fix-plan 1.3 part 1. `profiles.timezone` is
 * declared in the schema and read by every `period.ts` consumer
 * (`localDay`, `monthBounds`, ...), but nothing on web/desktop wrote it,
 * so every profile created or only ever used from a browser silently
 * kept the column default (`'UTC'`) regardless of where the user
 * actually is (audit 04-F4).
 *
 * Mounted once from `dashboard/layout.tsx` so it runs on every
 * authenticated dashboard load — zones change when people travel, so
 * this is a standing correction, not a one-time sign-up write. Fire-
 * and-forget: never blocks render, never surfaces an error to the user,
 * mirrors the mobile hook's "a transient failure just means the next
 * launch tries again" posture.
 */
export function TimezoneSync({
  userId,
  storedTimezone,
}: {
  userId: string
  storedTimezone: string | null | undefined
}) {
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!detected || detected === storedTimezone) return
    const supabase = createClient()
    supabase
      .from('profiles')
      .update({ timezone: detected })
      .eq('id', userId)
      .then(({ error }) => {
        if (error) {
          console.warn('[TimezoneSync] failed to capture browser timezone', error.message)
        }
      })
  }, [userId, storedTimezone])

  return null
}
