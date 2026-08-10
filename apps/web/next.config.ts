import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// The Supabase project's own origin — the one third party this app's
// renderer legitimately talks to directly (REST + Realtime). Derived
// from the same env var the client uses (`lib/supabase/{client,server}.
// ts`) rather than hard-coded, so a project change or environment swap
// can't silently drift the CSP out of sync with what the client
// actually connects to. `wss:` is listed separately from `https:`
// because CSP's `connect-src` matches scheme+host, not just host — a
// WebSocket (Realtime) connection to the https-listed origin alone
// would still be blocked.
function supabaseConnectSrc(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return ''
  try {
    const u = new URL(raw)
    return `${u.protocol}//${u.host} wss://${u.host}`
  } catch {
    return ''
  }
}

// fix-plan 4.5 / audit 07-F40. `default-src 'self'` is the floor: no
// third party can load a script, stylesheet, frame or fetch target into
// this app unless explicitly listed below. `script-src`/`style-src` keep
// `'unsafe-inline'` — Next's own hydration bootstrap and this app's
// extensive use of React inline `style={{...}}` both require it; a
// nonce-based CSP that removes it is real future hardening but a
// separate, larger change (per-request middleware threading a nonce
// through every inline style), not this item's scope. `img-src` carries
// exactly one exception: `t0.gstatic.com`, the favicon service
// `MerchantLogo` queries directly (fix-plan 3.5's disclosed, deliberate
// behavior — see `privacy.tsx`'s merchant-logos row). Fonts are
// self-hosted via `next/font` (`app/layout.tsx`) specifically so this
// list needs no Google Fonts exception.
function contentSecurityPolicy(): string {
  const connect = ['\'self\'', supabaseConnectSrc()].filter(Boolean).join(' ')
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://t0.gstatic.com",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

const nextConfig: NextConfig = {
  transpilePackages: ['@voice-expense/shared', '@voice-expense/ai'],
  allowedDevOrigins: ['192.168.1.5'],
  output: 'standalone',
  outputFileTracingRoot: join(here, '../..'),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Belt-and-suspenders alongside `frame-ancestors` above — an
          // older browser that ignores CSP's `frame-ancestors` still
          // honours this header.
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default nextConfig
