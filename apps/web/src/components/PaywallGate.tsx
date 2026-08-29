// Plus-gated route surface. When the user is not Plus, render a soft-wall
// that mirrors the mobile paywall (`apps/mobile/app/more/paywall.tsx`) in
// tone: serif headline, two-line value prop. Below it the real surface is
// hidden behind a blur overlay so the user can preview what's behind the
// wall.
//
// Payments (Aug 16, 2026 owner decision): Murmur Plus is sold as an iOS
// subscription through RevenueCat; web and desktop unlock from the same
// account because the server writes `profiles.plus_status` from the store
// record. So this gate does not sell — it tells the truth: subscribe in
// the iPhone app (plans, prices and trial come from the store there — the
// web never states a price it can't read), and offers a "Refresh" that
// re-reads the entitlement for someone who just did.
//
// History (fix-plan 3.1): this used to render an inert `<div>Upgrade to
// Plus</div>` next to a note that lied about a dev/prod branch; then an
// honest "Plus is in preview" state while no purchase flow existed.
import type { ReactNode } from 'react'
import { colors, font, radius } from '../lib/theme'
import { Icon } from './Icons'
import { PlusRefreshButton } from './PlusRefreshButton'

export function PaywallGate({
  title,
  body,
  feature,
  children,
}: {
  title: string
  body: string
  feature: string
  children?: ReactNode
}) {
  return (
    <div style={{ position: 'relative', minHeight: 480 }}>
      <div style={styles.overlay}>
        <div style={styles.card}>
          <div style={styles.icon}>
            <Icon.lock color={colors.accent} size={20} />
          </div>
          <div style={styles.eyebrow}>{`Murmur Plus · ${feature}`}</div>
          <div style={styles.title}>{title}</div>
          <div style={styles.body}>{body}</div>
          <div style={styles.note}>
            Subscribe in the Murmur app on your iPhone (Settings → Subscription, the app shows the plans,
            prices and free trial). Your account unlocks everywhere, including here.
          </div>
          <PlusRefreshButton compact />
        </div>
      </div>
      {children && <div style={styles.behind}>{children}</div>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  behind: {
    filter: 'blur(8px)',
    opacity: 0.35,
    pointerEvents: 'none',
    userSelect: 'none' as const,
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  card: {
    background: colors.card,
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.xl,
    padding: '28px 32px',
    width: 420,
    maxWidth: '90%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 10,
    boxShadow: '0 12px 40px rgba(40,36,28,0.10)',
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: colors.accentSoft,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: font.sans,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  title: {
    fontFamily: font.serif,
    fontSize: 26,
    fontWeight: 500,
    letterSpacing: -0.5,
    color: colors.ink,
    lineHeight: 1.2,
  },
  body: {
    fontFamily: font.sans,
    fontSize: 14,
    color: colors.ink2,
    lineHeight: 1.5,
  },
  note: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.ink3,
    marginTop: 8,
  },
}
