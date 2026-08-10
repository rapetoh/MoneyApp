import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { getProfile } from '../../lib/data'
import { Sidebar } from '../../components/Sidebar'
import { colors } from '../../lib/theme'
import { PlusProvider } from '../../lib/plus'
import { resolvePlusStatus } from '../../lib/plus.server'
import { TimezoneSync } from '../../components/TimezoneSync'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // The profile read here only backs cosmetic chrome (sidebar display
  // name, the Plus gate) — degrade to the same "no profile row yet"
  // rendering this file has always tolerated on failure, logged
  // server-side, rather than crashing every route in the app. Next's
  // error.js boundaries do not catch a throw from a layout.js in their
  // *own* segment (only from the page.js/nested layouts below it —
  // see the Next.js docs on error.js), so a bare `await getProfile`
  // here would fall through `dashboard/error.tsx` entirely, to Next's
  // unbranded default error screen. Overview and Insights, where the
  // profile/transaction read *is* the page's content, let the same
  // `DataFetchError` propagate to that boundary instead (fix-plan 2.13).
  const [profile, recurringResult, deviceResult] = await Promise.all([
    getProfile(supabase, user.id).catch((err: unknown) => {
      console.error('[dashboard layout] profile read failed', err)
      return null
    }),
    supabase
      .from('recurring_rules')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true),
    // Fix-plan 3.7: the sidebar's "Synced just now" used to render
    // unconditionally, including offline. `devices.last_synced_at` is
    // written by `apps/mobile/src/services/sync/deviceRegistry.ts` at the
    // end of a real drain pass — this reads the most recently synced of
    // the user's own devices (mobile is the only writer today; web/desktop
    // have no offline outbox to report on), so the sidebar states either a
    // real timestamp or "not synced yet" rather than a hardcoded lie.
    supabase
      .from('devices')
      .select('last_synced_at')
      .eq('user_id', user.id)
      .order('last_synced_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ])
  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'User'
  const recurringCount = recurringResult.count ?? 0
  const lastSyncedAt = deviceResult.data?.last_synced_at ?? null
  // Pass the profile in so `plus_status === 'active'` flips the gate
  // on production once IAP populates the column. Dev-only env hatches
  // still take effect when the column is null/free.
  const { isPlus } = resolvePlusStatus(profile)

  return (
    <PlusProvider isPlus={isPlus}>
      {/* Fire-and-forget: corrects `profiles.timezone` from the browser's
          own resolved zone whenever it drifts from what's stored (fix-plan
          1.3 part 1) — see the component for why this can't run server-side
          (Vercel's zone is not the visitor's). Renders nothing. */}
      <TimezoneSync userId={user.id} storedTimezone={profile?.timezone} />
      {/* The whole dashboard occupies one screen — sidebar + main are
          locked to viewport height (minus the macOS title strip in
          Electron). Only `<main>` is allowed to scroll, and only when
          its inner content actually overflows. The body itself never
          scrolls — that's how Claude Code / Linear / Notion behave on
          desktop. */}
      <div
        style={{
          display: 'flex',
          height: 'calc(100vh - var(--desktop-title-bar, 0px))',
          background: colors.background,
        }}
      >
        <Sidebar displayName={displayName} recurringCount={recurringCount} lastSyncedAt={lastSyncedAt} />
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            minWidth: 0,
          }}
        >
          {children}
        </main>
      </div>
    </PlusProvider>
  )
}
