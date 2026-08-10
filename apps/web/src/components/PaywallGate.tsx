// Plus-gated route surface. When the user is not Plus, render a soft-wall
// that mirrors the mobile paywall (`apps/mobile/app/more/paywall.tsx`) in
// tone: serif headline, two-line value prop. Below it the real surface is
// hidden behind a blur overlay so the user can preview what's behind the
// wall.
//
// Fix-plan 3.1: this used to render `<div>Upgrade to Plus</div>` — not a
// button, no `onClick`, nothing it could do when clicked — next to a note
// that only ever printed in the deployed build ("Plus is free in the dev
// build — production sees the upgrade flow here" is exactly backwards:
// there was no dev/prod branch, and no upgrade flow to see in either).
// There's no purchase flow yet on any platform, so this gate states that
// plainly instead of pretending a CTA exists.
import type { ReactNode } from 'react'
import { colors, font, radius } from '../lib/theme'
import { Icon } from './Icons'

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
            {"Plus is in preview. Purchases aren't live yet, so there's nothing to buy here."}
          </div>
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
