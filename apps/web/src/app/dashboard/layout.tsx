import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { getProfile } from '../../lib/data'
import { Sidebar } from '../../components/Sidebar'
import { colors } from '../../lib/theme'
import { PlusProvider } from '../../lib/plus'
import { resolvePlusStatus } from '../../lib/plus.server'

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
  const { isPlus } = resolvePlusStatus()

  return (
    <PlusProvider isPlus={isPlus}>
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
