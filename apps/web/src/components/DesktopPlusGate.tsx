'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { colors, font, radius } from '../lib/theme'
import { Icon } from './Icons'
import { PlusRefreshButton } from './PlusRefreshButton'

/**
 * The desktop app is part of Murmur Plus (pricing model, Sep 20 2026).
 *
 * The phone stays free forever; the big screen is one of the four things
 * Plus adds. Every new account holds Plus for its first seven days, so a
 * new user sees the real dashboard first and this screen only after the
 * trial ends.
 *
 * Settings stays reachable without Plus on purpose: an account must always
 * be manageable and deletable from any device (App Store 5.1.1(v)), and a
 * user who just subscribed on their phone needs somewhere to land while
 * the entitlement syncs.
 */
const ALWAYS_OPEN = ['/dashboard/settings']

export function DesktopPlusGate({ isPlus, children }: { isPlus: boolean; children: ReactNode }) {
  const pathname = usePathname() ?? ''
  if (isPlus || ALWAYS_OPEN.some((p) => pathname.startsWith(p))) return <>{children}</>

  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'grid',
        placeItems: 'center',
        padding: '48px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          textAlign: 'center',
          background: colors.surface,
          border: `1px solid ${colors.line}`,
          borderRadius: radius.xl,
          padding: '40px 36px',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: colors.accentSoft,
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 20px',
          }}
        >
          <Icon.sparkle size={24} color={colors.accent} />
        </div>
        <h1 style={{ fontFamily: font.serif, fontSize: 30, fontWeight: 500, color: colors.ink, margin: 0, lineHeight: 1.15 }}>
          The desktop app is part of Murmur Plus
        </h1>
        <p style={{ color: colors.ink3, fontSize: 15, lineHeight: 1.6, margin: '14px 0 0' }}>
          Keep logging on your phone for free, always. Plus adds this screen, Ask Murmur, automatic
          recurring detection and the reports.
        </p>
        <p style={{ color: colors.ink4, fontSize: 13.5, lineHeight: 1.6, margin: '18px 0 24px' }}>
          Open Murmur on your iPhone to start, then come back here. Your account unlocks everywhere.
        </p>
        <PlusRefreshButton />
      </div>
    </div>
  )
}
