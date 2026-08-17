// Shared frame for the public legal pages (/privacy, /terms) — payments,
// Aug 16 2026: App Store guideline 3.1.2 requires a Terms of Use and a
// Privacy Policy link next to any subscription price, and the mobile
// paywall links here (packages/shared/src/plus.ts LEGAL_URLS). No auth,
// no dashboard chrome — a reader who is not signed in must be able to
// read these.
import type { ReactNode } from 'react'
import Link from 'next/link'
import { MurmurMark } from './MurmurMark'
import { colors, font } from '../lib/theme'
import { SUPPORT_EMAIL } from '@voice-expense/shared'

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bg,
        color: colors.ink,
        fontFamily: font.sans,
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 80px' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              color: colors.ink,
            }}
          >
            <MurmurMark size={28} variant="sage" rounded />
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: -0.2 }}>Murmur</span>
          </Link>
          <nav style={{ display: 'flex', gap: 18, fontSize: 13, color: colors.ink3 }}>
            <Link href="/privacy" style={{ color: colors.ink3, textDecoration: 'none' }}>
              Privacy
            </Link>
            <Link href="/terms" style={{ color: colors.ink3, textDecoration: 'none' }}>
              Terms
            </Link>
          </nav>
        </header>

        <h1
          style={{
            fontFamily: font.serif,
            fontSize: 40,
            fontWeight: 500,
            letterSpacing: -0.8,
            margin: '44px 0 6px',
          }}
        >
          {title}
        </h1>
        <div style={{ fontSize: 13, color: colors.ink3, marginBottom: 32 }}>
          Last updated {updated}
        </div>

        <article className="legal-body">{children}</article>

        <footer
          style={{
            marginTop: 56,
            paddingTop: 20,
            borderTop: `0.5px solid ${colors.line}`,
            fontSize: 13,
            color: colors.ink3,
            lineHeight: 1.6,
          }}
        >
          Questions about this document:{' '}
          {SUPPORT_EMAIL ? (
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: colors.accent }}>
              {SUPPORT_EMAIL}
            </a>
          ) : (
            <>use the support contact on Murmur&apos;s App Store listing.</>
          )}
        </footer>
      </div>
      <style>{`
        .legal-body { font-size: 15px; line-height: 1.7; color: ${colors.ink2}; }
        .legal-body h2 { font-family: ${font.serif}; font-size: 22px; font-weight: 500; letter-spacing: -0.3px; color: ${colors.ink}; margin: 36px 0 10px; }
        .legal-body h3 { font-size: 15px; font-weight: 700; color: ${colors.ink}; margin: 22px 0 6px; }
        .legal-body p { margin: 0 0 12px; }
        .legal-body ul { margin: 0 0 14px 20px; padding: 0; }
        .legal-body li { margin: 4px 0; }
        .legal-body a { color: ${colors.accent}; }
        .legal-body .summary { background: ${colors.surface2}; border-radius: 12px; padding: 16px 18px; margin: 0 0 8px; }
        .legal-body .summary ul { margin-bottom: 0; }
        .legal-body table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 8px 0 16px; }
        .legal-body th, .legal-body td { text-align: left; vertical-align: top; padding: 8px 10px 8px 0; border-bottom: 0.5px solid ${colors.line}; }
        .legal-body th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: ${colors.ink3}; }
      `}</style>
    </div>
  )
}
