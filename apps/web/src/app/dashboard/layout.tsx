import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { getProfile } from '../../lib/data'
import { Sidebar } from '../../components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(supabase, user.id)
  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'User'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar displayName={displayName} />
      <main style={{ flex: 1, overflowX: 'hidden', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
