'use client'
// Web mirror of apps/mobile/src/components/MerchantAvatar.tsx — same favicon
// service (Google's t0.gstatic faviconV2 endpoint), same fallback chain
// (merchant initial → category initial → "?"), same retry-on-resync. Keep
// this component in lock-step with the mobile version: the merchant-logo
// surface is product-critical (per feedback memory: never regress merchant
// logos). `KNOWN_DOMAINS`/`guessDomain`/`merchantColor`/`categoryPalette`
// now live once in `@voice-expense/shared` (fix-plan 4.4) so this file and
// the mobile version can no longer diverge.
import { useEffect, useState } from 'react'
import {
  merchantColor,
  guessDomain,
  categoryPalette,
  brandDomainForMerchant,
  cleanMerchantDescriptor,
} from '@voice-expense/shared'
import { font } from '../lib/theme'

export function MerchantLogo({
  name,
  merchantDomain,
  categoryName,
  categoryColor,
  size = 36,
  radius = 10,
}: {
  name?: string | null
  /** Optional domain hint from AI (e.g. "netflix.com"). Use this rather than guessing. */
  merchantDomain?: string | null
  categoryName?: string | null
  /** Hex color from the category record. Used only when falling back to a category-initial tile. */
  categoryColor?: string | null
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

  // Fallback bg: the category's own color (fix-plan 4.4 — `categories.
  // color` is the single source of truth, no more name-regex `tintFor`
  // heuristic or hard-coded tint table) when there's no merchant to key
  // off; otherwise a deterministic hash of the merchant name. Both paths
  // guarantee ≥4.5:1 white-text contrast — `categoryPalette` derives it
  // for an arbitrary user-picked hex, `merchantColor`'s palette is
  // pre-vetted (see `color.ts` and its test).
  const bgColor =
    !hasMerchant && hasCategory && categoryColor
      ? categoryPalette(categoryColor).fg
      : merchantColor(fallbackSource)

  // Same chain as mobile's merchantLogo.ts (fix completely, both surfaces):
  // stored domain → brand table ("Target T-1768" → target.com) → naive
  // guess from the cleaned descriptor.
  const domain = hasMerchant
    ? (merchantDomain ??
      brandDomainForMerchant(name!) ??
      guessDomain(cleanMerchantDescriptor(name!)))
    : null
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
        // Never a native image drag — on the mind-map canvas a drag that
        // starts on a logo is a pan, and in a list it's nothing.
        draggable={false}
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
