import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, DM_Mono } from 'next/font/google'
import { DesktopChrome } from '../components/DesktopChrome'
import './globals.css'

// Self-hosted via next/font (fix-plan 4.5 / audit 07-F40) — replaces the
// fonts.googleapis.com <link> that used to sit in <head>. Two things
// that broke: it forced the CSP below to carry a Google Fonts exception
// in `style-src`/`font-src` (a `default-src 'self'` policy is only as
// strong as its exception list), and it meant the packaged desktop app —
// whose whole pitch is a local-first embedded server — silently
// depended on network access just to render its own UI font offline.
// `variable` (not the default `.className`) because next/font scopes
// the actual generated `font-family` value with a build hash to avoid
// colliding with a same-named font already installed on the system;
// `lib/theme.ts`'s `font.sans`/`font.mono` stacks and `globals.css`
// reference these two CSS custom properties instead of the literal
// "Plus Jakarta Sans"/"DM Mono" names for that reason.
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plus-jakarta-sans',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-dm-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://itsmurmur.com'),
  title: 'Murmur',
  description:
    'The voice-first, privacy-first expense tracker. Say what you spent - Murmur files it. No bank linking, ever.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${dmMono.variable}`}>
      <body>
        <DesktopChrome />
        {children}
      </body>
    </html>
  )
}
