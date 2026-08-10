'use client'

import { useEffect } from 'react'
import { colors, font } from '../../lib/theme'
import { ErrorState } from '../../components/ErrorState'

/**
 * The missing server-component backstop (fix-plan item 2.13's explicit
 * ask). Next.js mounts this in place of the whole `dashboard` segment
 * whenever a Server Component in it throws during render — until now
 * there was none, so an unhandled render-time exception in Overview or
 * Insights (both `async function` Server Components reading straight
 * from Supabase) crashed to Next's generic, unbranded default error
 * screen instead of anything the rest of the app looks like. Also
 * catches a client-component render throw anywhere else in the segment
 * (React error boundary semantics), not only the two RSC pages.
 *
 * A narrower backstop than the per-page loading/error/empty split the
 * client pages below do for their own *fetch* failures (a rejected
 * Supabase query resolves to `{ data: null, error }`, it doesn't throw)
 * — this only fires on an actual thrown exception. `error.tsx` files are
 * required client components by the framework.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard] unhandled render error', error)
  }, [error])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 400,
        background: colors.bg,
        fontFamily: font.sans,
      }}
    >
      <ErrorState message="Something went wrong loading this page." detail={error.message} onRetry={reset} />
    </div>
  )
}
