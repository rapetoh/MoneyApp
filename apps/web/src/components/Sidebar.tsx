'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient } from '../lib/supabase/client'
import { colors, font, radius } from '../lib/theme'
import { Icon } from './Icons'
import { MurmurMark } from './MurmurMark'

type NavKey =
  | 'overview'
  | 'tx'
  | 'budgets'
  | 'recurring'
  | 'ask'
  | 'reports'
  | 'export'
  | 'settings'

type GroupKey = 'overview' | 'plan' | 'analyze' | 'data'

const NAV: Array<{
  key: NavKey
  label: string
  href: string
  icon: (p: { color?: string; size?: number }) => ReactNode
  group: GroupKey
  plus?: boolean
  /** AI pill on the right of the row (Ask Murmur). */
  aiPill?: boolean
  /** Numeric count badge surfaced on the row (Recurring rule count). */
  badgeKey?: 'recurring'
}> = [
  { key: 'overview', label: 'Overview', href: '/dashboard', icon: Icon.chart, group: 'overview' },
  { key: 'tx', label: 'Transactions', href: '/dashboard/transactions', icon: Icon.list, group: 'overview' },
  { key: 'budgets', label: 'Budgets', href: '/dashboard/budgets', icon: Icon.sparkle, group: 'plan' },
  { key: 'recurring', label: 'Recurring', href: '/dashboard/recurring', icon: Icon.refresh, group: 'plan', badgeKey: 'recurring' },
  { key: 'ask', label: 'Ask Murmur', href: '/dashboard/ask', icon: Icon.sparkle, group: 'plan', plus: true, aiPill: true },
  { key: 'reports', label: 'Reports & forecast', href: '/dashboard/insights', icon: Icon.chart, group: 'analyze', plus: true },
  { key: 'export', label: 'Export', href: '/dashboard/export', icon: Icon.download, group: 'data', plus: true },
  { key: 'settings', label: 'Settings', href: '/dashboard/settings', icon: Icon.settings, group: 'data' },
]

const GROUP_LABEL: Record<GroupKey, string> = {
  overview: 'Overview',
  plan: 'Plan',
  analyze: 'Analyze',
  data: 'Data',
}

export function Sidebar({
  displayName,
  recurringCount,
}: {
  displayName?: string | null
  /** Count badge value on the Recurring nav row. Falsy/0 hides the badge. */
  recurringCount?: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const groups: GroupKey[] = ['overview', 'plan', 'analyze', 'data']
  const initial = (displayName ?? 'U').trim()[0]?.toUpperCase() ?? 'U'

  return (
    <aside style={styles.sidebar}>
      {/* Floating glass panel — inset 8 from the column edges, 18px radius. */}
      <div style={styles.glass} aria-hidden />

      {/* Brand row */}
      <div style={styles.brandRow}>
        <MurmurMark size={24} variant="sage" rounded />
        <span style={styles.brandWord}>Murmur</span>
      </div>

      {/* Nav groups */}
      <nav style={styles.nav}>
        {groups.map((g) => (
          <div key={g} style={styles.group}>
            <div style={styles.groupLabel}>{GROUP_LABEL[g]}</div>
            {NAV.filter((n) => n.group === g).map((n) => {
              const active =
                n.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(n.href)
              const itemColor = active ? '#fff' : colors.ink2
              const itemIconColor = active ? '#fff' : colors.ink3
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  prefetch
                  style={{
                    ...styles.navItem,
                    background: active ? colors.accent : 'transparent',
                    color: itemColor,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16 }}>
                    {n.icon({ color: itemIconColor, size: 14 })}
                  </span>
                  <span style={{ flex: 1 }}>{n.label}</span>
                  {n.badgeKey === 'recurring' && !!recurringCount && (
                    <span
                      style={{
                        ...styles.countBadge,
                        background: active ? 'rgba(255,255,255,0.22)' : colors.surface2,
                        color: active ? '#fff' : colors.ink3,
                      }}
                    >
                      {recurringCount}
                    </span>
                  )}
                  {n.aiPill && (
                    <span
                      style={{
                        ...styles.aiPill,
                        background: active ? 'rgba(255,255,255,0.22)' : colors.accentSoft,
                        color: active ? '#fff' : colors.accent,
                      }}
                    >
                      AI
                    </span>
                  )}
                  {n.plus && !n.aiPill && !active && (
                    <span style={styles.plusBadge}>Plus</span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      {/* User card */}
      <div style={styles.userCard}>
        <div style={styles.userAvatar}>{initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.userName}>{displayName ?? 'You'}</div>
          <div style={styles.userMeta}>Synced just now</div>
        </div>
        <button onClick={handleSignOut} style={styles.signOut} title="Sign out">
          <Icon.signOut color={colors.ink3} size={14} />
        </button>
      </div>
    </aside>
  )
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 230,
    minHeight: '100vh',
    height: '100vh',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    background: 'transparent',
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    alignSelf: 'flex-start',
  },
  // Absolutely positioned floating glass panel — sits 8px in from each
  // sidebar edge with an 18px radius, blurred + saturated background. The
  // sidebar's own bg stays transparent so the panel reads as a card.
  glass: {
    position: 'absolute',
    inset: 8,
    borderRadius: 18,
    background: 'rgba(250,247,240,0.8)',
    backdropFilter: 'blur(50px) saturate(180%)',
    WebkitBackdropFilter: 'blur(50px) saturate(180%)',
    border: '0.5px solid rgba(255,255,255,0.6)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  brandRow: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 16px 18px',
  },
  brandWord: {
    fontFamily: font.sans,
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  nav: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  groupLabel: {
    padding: '8px 18px 4px',
    fontSize: 10,
    fontWeight: 700,
    color: colors.ink3,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    fontFamily: font.sans,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    margin: '1px 10px',
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontWeight: 500,
    fontSize: 12.5,
    transition: 'background 120ms',
  },
  plusBadge: {
    fontFamily: font.sans,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: colors.accent,
    background: colors.accentSoft,
    padding: '2px 6px',
    borderRadius: 4,
  },
  countBadge: {
    fontFamily: font.sans,
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 8,
  },
  aiPill: {
    fontFamily: font.sans,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    padding: '1px 6px',
    borderRadius: 8,
  },
  userCard: {
    position: 'relative',
    zIndex: 1,
    margin: '0 10px 10px',
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.6)',
    border: `0.5px solid ${colors.line}`,
  },
  userAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    background: '#F3E7DC',
    color: '#7A4A22',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: font.sans,
    fontWeight: 700,
    fontSize: 12,
    flexShrink: 0,
  },
  userName: {
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userMeta: {
    fontFamily: font.sans,
    fontSize: 10,
    color: colors.ink3,
  },
  signOut: {
    width: 26,
    height: 26,
    borderRadius: 8,
    border: `0.5px solid ${colors.line}`,
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    cursor: 'pointer',
  },
}
