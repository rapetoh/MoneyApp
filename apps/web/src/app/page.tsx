import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '../lib/supabase/server'
import { MurmurMark } from '../components/MurmurMark'
import { colors, font, radius } from '../lib/theme'
import { SUPPORT_EMAIL } from '@voice-expense/shared'

export const metadata: Metadata = {
  title: 'Murmur — speak your spending',
  description:
    'The voice-first, privacy-first expense tracker. Say what you spent — Murmur files it. Apple Pay capture, AI answers over your own numbers, no bank linking ever.',
}

/**
 * Public landing page at itsmurmur.com (Aug 28, 2026 — the domain the
 * owner registered; DNS → Vercel). Until now `/` bounced straight to
 * /login, which meant the App Store listing, the legal pages and the
 * support address had no public home. Signed-in users still land on
 * their dashboard, unchanged.
 *
 * Honesty rules (same bar as the paywall): no download button exists
 * until the thing it downloads exists — iOS says "App Store soon"
 * without a dead link, desktop appears when the signed build ships.
 * No screenshots faked, no metrics invented.
 */
export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const features: Array<{ title: string; body: string }> = [
    {
      title: 'Say it, it’s saved',
      body: 'One tap, one sentence — “eight dollars at Lays”. Speech becomes a categorised expense. Transcription happens on your phone; audio never leaves it.',
    },
    {
      title: 'Apple Pay, captured',
      body: 'Set up once. Every tap-to-pay purchase files itself in the background — amount, merchant, category — with a quiet confirmation you can undo.',
    },
    {
      title: 'Ask Murmur',
      body: 'Ask questions in plain words — “what did food cost me this month?” — and get answers grounded in your own numbers, not generic advice.',
    },
    {
      title: 'Insights that look ahead',
      body: 'Monthly forecasts, spending patterns, recurring-bill radar and budgets that understand your pay cycle.',
    },
    {
      title: 'Your data, portable',
      body: 'Export everything as CSV, JSON or a print-ready PDF. Delete everything, permanently, from Settings — no email required.',
    },
    {
      title: 'No bank linking. Ever.',
      body: 'Murmur never connects to your accounts. Everything in it is something you chose to put there. That is the point.',
    },
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bg,
        color: colors.ink,
        fontFamily: font.sans,
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '28px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MurmurMark size={30} variant="sage" rounded />
            <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: -0.2 }}>Murmur</span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: 14 }}>
            <Link href="/privacy" style={{ color: colors.ink3, textDecoration: 'none' }}>
              Privacy
            </Link>
            <Link
              href={user ? '/dashboard' : '/login'}
              style={{
                color: '#fff',
                background: colors.accent,
                textDecoration: 'none',
                fontWeight: 600,
                padding: '9px 18px',
                borderRadius: radius.full ?? 999,
              }}
            >
              {user ? 'Open dashboard' : 'Log in'}
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section style={{ padding: '64px 0 56px', textAlign: 'center' }}>
          <h1
            style={{
              fontFamily: font.serif,
              fontSize: 'clamp(40px, 7vw, 64px)',
              fontWeight: 500,
              letterSpacing: -1.5,
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            Speak your spending.
          </h1>
          <p
            style={{
              fontSize: 18,
              color: colors.ink2,
              lineHeight: 1.6,
              maxWidth: 560,
              margin: '20px auto 0',
            }}
          >
            Murmur is the voice-first expense tracker that keeps your money story between you and
            your phone. Say it — or just tap to pay — and it&rsquo;s filed. No spreadsheets, no bank
            logins.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: 32,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: colors.ink3,
                background: colors.surface2,
                padding: '10px 18px',
                borderRadius: 999,
              }}
            >
              Coming soon to the App Store
            </span>
            <Link
              href={user ? '/dashboard' : '/login'}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: colors.accent,
                background: colors.accentSoft,
                padding: '10px 18px',
                borderRadius: 999,
                textDecoration: 'none',
              }}
            >
              Web dashboard →
            </Link>
          </div>
        </section>

        {/* Features */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 14,
            paddingBottom: 56,
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                background: colors.card,
                border: `0.5px solid ${colors.line}`,
                borderRadius: radius.xl,
                padding: '22px 24px',
              }}
            >
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 20,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                }}
              >
                {f.title}
              </div>
              <p style={{ fontSize: 14, color: colors.ink2, lineHeight: 1.6, margin: '8px 0 0' }}>
                {f.body}
              </p>
            </div>
          ))}
        </section>

        {/* Plus strip */}
        <section
          style={{
            background: colors.accent,
            borderRadius: radius.xl,
            padding: '36px 32px',
            textAlign: 'center',
            color: '#FBFAF7',
            marginBottom: 64,
          }}
        >
          <div
            style={{ fontFamily: font.serif, fontSize: 26, fontWeight: 500, letterSpacing: -0.4 }}
          >
            Murmur Plus
          </div>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              opacity: 0.9,
              maxWidth: 520,
              margin: '10px auto 0',
            }}
          >
            Ask Murmur, automatic recurring detection, full export and the desktop &amp; web
            dashboard. One subscription on your iPhone — 7 days free, then $3.99/month or
            $29.99/year. Cancel anytime.
          </p>
        </section>

        {/* Footer */}
        <footer
          style={{
            borderTop: `0.5px solid ${colors.line}`,
            padding: '24px 0 40px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            fontSize: 13,
            color: colors.ink3,
          }}
        >
          <span>© {new Date().getFullYear()} Murmur</span>
          <nav style={{ display: 'flex', gap: 18 }}>
            <Link href="/privacy" style={{ color: colors.ink3, textDecoration: 'none' }}>
              Privacy
            </Link>
            <Link href="/terms" style={{ color: colors.ink3, textDecoration: 'none' }}>
              Terms
            </Link>
            {SUPPORT_EMAIL && (
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                style={{ color: colors.ink3, textDecoration: 'none' }}
              >
                {SUPPORT_EMAIL}
              </a>
            )}
          </nav>
        </footer>
      </div>
    </div>
  )
}
