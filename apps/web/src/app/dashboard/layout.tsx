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

  const [profile, recurringResult] = await Promise.all([
    getProfile(supabase, user.id),
    supabase
      .from('recurring_rules')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true),
  ])
  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'User'
  const recurringCount = recurringResult.count ?? 0
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
        <Sidebar displayName={displayName} recurringCount={recurringCount} />
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
