'use client'
// Web mirror of apps/mobile/src/components/MerchantAvatar.tsx — same favicon
// service (Google's t0.gstatic faviconV2 endpoint), same fallback chain
// (merchant initial → category initial → "?"), same retry-on-resync. Keep
// this component in lock-step with the mobile version: the merchant-logo
// surface is product-critical (per feedback memory: never regress merchant
// logos). If mobile's KNOWN_DOMAINS list is updated, copy the change here.
import { useEffect, useState } from 'react'
import { merchantColor, type Category } from '@voice-expense/shared'
import { font, cat as catTints, type CategoryTint } from '../lib/theme'
import { tintFor } from '../lib/categories'

const KNOWN_DOMAINS: Record<string, string> = {
  netflix: 'netflix.com',
  spotify: 'spotify.com',
  amazon: 'amazon.com',
  walmart: 'walmart.com',
  target: 'target.com',
  costco: 'costco.com',
  starbucks: 'starbucks.com',
  mcdonalds: 'mcdonalds.com',
  uber: 'uber.com',
  ubereats: 'ubereats.com',
  lyft: 'lyft.com',
  apple: 'apple.com',
  google: 'google.com',
  microsoft: 'microsoft.com',
  adobe: 'adobe.com',
  hulu: 'hulu.com',
  disneyplus: 'disneyplus.com',
  disney: 'disney.com',
  hbomax: 'hbomax.com',
  youtube: 'youtube.com',
  paypal: 'paypal.com',
  venmo: 'venmo.com',
  cashapp: 'cash.app',
  bestbuy: 'bestbuy.com',
  homedepot: 'homedepot.com',
  lowes: 'lowes.com',
  ikea: 'ikea.com',
  nike: 'nike.com',
  adidas: 'adidas.com',
  zara: 'zara.com',
  sephora: 'sephora.com',
  wholefoods: 'wholefoods.com',
  traderjoes: 'traderjoes.com',
  kroger: 'kroger.com',
  walgreens: 'walgreens.com',
  cvs: 'cvs.com',
  tmobile: 't-mobile.com',
  verizon: 'verizon.com',
  att: 'att.com',
  comcast: 'comcast.com',
  chipotle: 'chipotle.com',
  doordash: 'doordash.com',
  grubhub: 'grubhub.com',
  airbnb: 'airbnb.com',
  booking: 'booking.com',
  expedia: 'expedia.com',
  playstation: 'playstation.com',
  xbox: 'xbox.com',
  steam: 'steampowered.com',
  github: 'github.com',
  notion: 'notion.so',
  slack: 'slack.com',
  zoom: 'zoom.us',
  dropbox: 'dropbox.com',
  chickfila: 'chick-fil-a.com',
  burgerking: 'bk.com',
  wendys: 'wendys.com',
  dominos: 'dominos.com',
  pizzahut: 'pizzahut.com',
  subways: 'subway.com',
  subway: 'subway.com',
  dunkin: 'dunkindonuts.com',
  panera: 'panerabread.com',
}

function guessDomain(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return KNOWN_DOMAINS[normalized] ?? `${normalized}.com`
}

export function MerchantLogo({
  name,
  merchantDomain,
  categoryName,
  categoryColor,
  tint,
  size = 36,
  radius = 10,
}: {
  name?: string | null
  /** Optional domain hint from AI (e.g. "netflix.com"). Use this rather than guessing. */
  merchantDomain?: string | null
  categoryName?: string | null
  /** Hex color from the category record. Used only when falling back to a category-initial tile. */
  categoryColor?: string | null
  tint?: CategoryTint
  size?: number
  radius?: number
}) {
  const [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => {
    setLogoFailed(false)
  }, [name, merchantDomain])

  const hasMerchant = !!name && name.trim().length > 0
  const hasCategory = !!categoryName && categoryName.trim().length > 0
  const fallbackSource = hasMerchant ? name! : hasCategory ? categoryName! : '?'
  const initial = fallbackSource[0]?.toUpperCase() ?? '?'

  // Fallback bg: explicit category color first, then deterministic merchant
  // hash, then the requested tint, finally other.
  const tintBg = catTints[tint ?? tintFor(categoryName ?? name ?? null)].bg
  const bgColor = !hasMerchant && hasCategory && categoryColor
    ? categoryColor
    : hasMerchant
      ? merchantColor(fallbackSource)
      : tintBg

  const domain = hasMerchant ? merchantDomain ?? guessDomain(name!) : null
  const logoUrl =
    domain && !logoFailed
      ? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=128`
      : null

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name ?? 'Merchant logo'}
        onError={() => setLogoFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: '#fff',
          objectFit: 'cover',
          flexShrink: 0,
          border: '0.5px solid rgba(40,36,28,0.06)',
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: bgColor,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
        fontFamily: font.display,
        letterSpacing: -0.3,
      }}
    >
      {initial}
    </div>
  )
}

// Re-export the Category type for callers that need it.
export type { Category }
