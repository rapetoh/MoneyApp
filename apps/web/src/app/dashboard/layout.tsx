import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { getProfile } from '../../lib/data'
import { Sidebar } from '../../components/Sidebar'
import { colors } from '../../lib/theme'

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.background }}>
      <Sidebar displayName={displayName} recurringCount={recurringCount} />
      <main style={{ flex: 1, overflowX: 'hidden', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
