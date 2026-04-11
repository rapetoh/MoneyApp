'use client'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase/client'
import { colors, font, fontSize, spacing, radius } from '../lib/theme'

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: '◈' },
  { href: '/dashboard/transactions', label: 'Transactions', icon: '↕' },
  { href: '/dashboard/budgets', label: 'Budgets', icon: '◎' },
  { href: '/dashboard/export', label: 'Export', icon: '↓' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
]

export function Sidebar({ displayName }: { displayName?: string | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside style={styles.sidebar}>
      {/* Logo */}
      <div style={styles.logo}>
        <div style={styles.logoMark} />
        <span style={styles.logoText}>Voice Expense</span>
      </div>

      {/* User */}
      {displayName && (
        <div style={styles.userRow}>
          <div style={styles.userAvatar}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <span style={styles.userName} title={displayName}>{displayName}</span>
        </div>
      )}

      {/* Nav */}
      <nav style={styles.nav}>
        {NAV.map((item) => {
          const active = pathname === item.href
          return (
            <a
              key={item.href}
              href={item.href}
              style={{
                ...styles.navItem,
                ...(active ? styles.navItemActive : {}),
              }}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          )
        })}
      </nav>

      {/* Sign out */}
      <button onClick={handleSignOut} style={styles.signOut}>
        Sign Out
      </button>
    </aside>
  )
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 240,
    minHeight: '100vh',
    background: colors.sidebar,
    display: 'flex',
    flexDirection: 'column',
    padding: `${spacing.xl}px ${spacing.base}px`,
    gap: spacing.base,
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    alignSelf: 'flex-start',
    height: '100vh',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `0 ${spacing.xs}px`,
    marginBottom: spacing.sm,
  },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    background: colors.primary,
    flexShrink: 0,
  },
  logoText: {
    fontFamily: font.sans,
    fontWeight: 700,
    fontSize: fontSize.base,
    color: colors.white,
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.xs}px`,
    marginBottom: spacing.xs,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    background: colors.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: font.sans,
    fontWeight: 700,
    fontSize: fontSize.sm,
    color: colors.white,
    flexShrink: 0,
  },
  userName: {
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    color: colors.sidebarText,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    flex: 1,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontWeight: 500,
    fontSize: fontSize.sm,
    color: colors.sidebarText,
    transition: 'background 0.15s',
  },
  navItemActive: {
    background: colors.primary,
    color: colors.white,
  },
  navIcon: {
    fontSize: fontSize.md,
    width: 20,
    textAlign: 'center',
    flexShrink: 0,
  },
  signOut: {
    background: 'rgba(255,255,255,0.08)',
    border: 'none',
    borderRadius: radius.md,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontFamily: font.sans,
    fontWeight: 500,
    fontSize: fontSize.sm,
    color: colors.sidebarText,
    textAlign: 'left',
    marginTop: 'auto',
  },
}
