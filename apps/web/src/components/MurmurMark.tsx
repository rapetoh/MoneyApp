// Coin & Wave — Murmur brand mark (adopted Aug 7, 2026, replacing The
// Listening Drop at the user's direction). Mirrors
// apps/mobile/src/components/MurmurMark.tsx and the exploration at
// docs/money-app/project/Murmur Logos.html direction 04: a coin with a
// soft wave engraved across it, on a 160-unit grid (coin r=62 at 80,80;
// primary wave at y=80, faint secondary at y=96).

type Variant = 'cream' | 'sage' | 'ink' | 'mono-ink' | 'mono-cream'

const PALETTES: Record<Variant, { bg: string | null; coin: string; wave: string }> = {
  // 'gradient' coin is special-cased below — the cream tile carries the
  // hero radial-gradient coin from the design sheet.
  cream: { bg: '#FBFAF7', coin: 'gradient', wave: '#FBFAF7' },
  sage: { bg: '#3F5A3E', coin: '#FBFAF7', wave: '#3F5A3E' },
  ink: { bg: '#1B1915', coin: '#FBFAF7', wave: '#1B1915' },
  'mono-ink': { bg: null, coin: '#1B1915', wave: '#FBFAF7' },
  'mono-cream': { bg: null, coin: '#FBFAF7', wave: '#1B1915' },
}

export function MurmurMark({
  size = 32,
  variant = 'sage',
  rounded = true,
  /** When true, the engraved waves breathe on a 2.6s loop — used on Ask
   *  Murmur during the model's thinking state so the brand mark is the
   *  loading affordance rather than a generic spinner. */
  animating = false,
}: {
  size?: number
  variant?: Variant
  rounded?: boolean
  animating?: boolean
}) {
  const p = PALETTES[variant]
  const radius = rounded ? size * 0.22 : 0
  const gradientId = `murmur-coin-${variant}`
  const coinFill = p.coin === 'gradient' ? `url(#${gradientId})` : p.coin
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      style={{ flexShrink: 0, display: 'block' }}
      aria-hidden="true"
    >
      {p.coin === 'gradient' && (
        <defs>
          <radialGradient id={gradientId} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0%" stopColor="#5C7B5A" />
            <stop offset="100%" stopColor="#2D4530" />
          </radialGradient>
        </defs>
      )}
      {p.bg && (
        <rect width="160" height="160" rx={radius * (160 / size)} fill={p.bg} />
      )}
      <circle cx="80" cy="80" r="62" fill={coinFill} />
      {p.coin === 'gradient' && (
        <>
          <circle cx="80" cy="80" r="62" fill="none" stroke="#FBFAF7" strokeWidth="1" opacity="0.18" />
          <circle cx="80" cy="80" r="50" fill="none" stroke="#FBFAF7" strokeWidth="1" opacity="0.18" />
        </>
      )}
      <path
        d="M40 80 Q 55 64, 70 80 T 100 80 T 130 80"
        stroke={p.wave}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
        opacity="0.95"
        className={animating ? 'murmur-pulse-arc1' : undefined}
      />
      <path
        d="M40 96 Q 55 86, 70 96 T 100 96 T 120 96"
        stroke={p.wave}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.45"
        className={animating ? 'murmur-pulse-arc2' : undefined}
      />
    </svg>
  )
}
