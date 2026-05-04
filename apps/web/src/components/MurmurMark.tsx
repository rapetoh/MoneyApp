// The Listening Drop — Murmur brand mark. Mirrors
// apps/mobile/src/components/MurmurMark.tsx and the brand sheet at
// docs/money-app/project/Murmur Brand Sheet.html §02. The droplet sits on a
// 160-unit grid with inner-pulse radii 6 / 16 / 28.
import { colors } from '../lib/theme'

type Variant = 'cream' | 'sage' | 'ink' | 'mono-ink' | 'mono-cream'

const PALETTES: Record<Variant, { bg: string | null; ink: string; pulse: string }> = {
  cream: { bg: '#FBFAF7', ink: '#1B1915', pulse: '#FBFAF7' },
  sage: { bg: '#3F5A3E', ink: '#FBFAF7', pulse: '#3F5A3E' },
  ink: { bg: '#1B1915', ink: '#FBFAF7', pulse: '#1B1915' },
  'mono-ink': { bg: null, ink: '#1B1915', pulse: '#FBFAF7' },
  'mono-cream': { bg: null, ink: '#FBFAF7', pulse: '#1B1915' },
}

export function MurmurMark({
  size = 32,
  variant = 'sage',
  rounded = true,
  /** When true, the inner pulse arcs breathe on a 2.6s loop — the brand
   *  sheet \u00a706 specifies this for active listening + save events. We use
   *  it on Ask Murmur during the model's thinking state so the brand mark
   *  is the loading affordance rather than a generic spinner. */
  animating = false,
}: {
  size?: number
  variant?: Variant
  rounded?: boolean
  animating?: boolean
}) {
  const p = PALETTES[variant]
  const radius = rounded ? size * 0.22 : 0
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      style={{ flexShrink: 0, display: 'block' }}
      aria-hidden="true"
    >
      {p.bg && (
        <rect width="160" height="160" rx={radius * (160 / size)} fill={p.bg} />
      )}
      <path
        d="M80 18 C 122 18, 142 50, 142 86 C 142 118, 116 142, 80 142
           C 70 142, 60 140, 52 136 L 30 142 L 38 122
           C 24 110, 18 96, 18 86 C 18 50, 38 18, 80 18 Z"
        fill={p.ink}
      />
      <circle
        cx="80"
        cy="80"
        r="6"
        fill={p.pulse}
        className={animating ? 'murmur-pulse-dot' : undefined}
      />
      <path
        d="M64 80 a16 16 0 0 1 32 0"
        stroke={p.pulse}
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
        className={animating ? 'murmur-pulse-arc1' : undefined}
      />
      <path
        d="M52 80 a28 28 0 0 1 56 0"
        stroke={p.pulse}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.45"
        className={animating ? 'murmur-pulse-arc2' : undefined}
      />
    </svg>
  )
}

export function MurmurWordmark({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        fontFamily: '"New York", "Iowan Old Style", Georgia, serif',
        fontWeight: 500,
        fontSize: size,
        letterSpacing: -0.5,
        color: colors.ink,
      }}
    >
      Murmur
    </span>
  )
}
