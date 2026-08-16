import { View, type ViewStyle } from 'react-native'
import Svg, { Path, Circle, Defs, RadialGradient, Stop } from 'react-native-svg'

/**
 * Murmur — Coin & Wave.
 *
 * Brand mark per `docs/money-app/project/Murmur Logos.html` direction 04
 * (adopted Aug 7, 2026, replacing The Listening Drop at the user's
 * direction): a coin with a soft wave engraved across it — the one mark
 * that says "money" and "voice" in a single shape.
 *
 * Construction (do not modify without re-checking the design sheet):
 * - 160×160 viewBox; coin r=62 centered at (80,80).
 * - Hero (cream tile) coin carries a radial gradient #5C7B5A → #2D4530
 *   with two faint cream rings (r=62 stroke + r=50 inner, opacity 0.18).
 * - Engraved waves: primary at y=80 (stroke 5, opacity 0.95), faint
 *   secondary at y=96 (stroke 3, opacity 0.45). Never add a 3rd wave.
 *
 * Variant names are unchanged from the previous mark so call sites keep
 * working; their semantics map tile-background → coin color → wave color.
 * Tinted (iOS-18 home-screen tinted mode) and the mono variants drop the
 * waves so the silhouette can take a single color.
 */

export type MurmurVariant =
  | 'cream' // default — gradient coin on cream background, cream waves
  | 'sage' // brand — cream coin on sage background, sage waves
  | 'ink' // dark mode — cream coin on ink background, ink waves
  | 'tinted' // iOS 18 tinted — silhouette only, no waves
  | 'cream-accent' // cream tile, ink coin, sage waves (accent)
  | 'stone' // sage coin on stone background
  | 'outline' // outlined coin, ink stroke + primary wave only
  | 'mono-ink' // solid ink coin silhouette — for ≤16px / favicon territory
  | 'mono-cream' // solid cream coin silhouette — for use on dark backgrounds

interface MurmurMarkProps {
  size?: number
  variant?: MurmurVariant
  /** Optional outer style — width/height come from `size`. */
  style?: ViewStyle
}

// NOTE: The 2.6s breathing animation for "real states" (listening /
// saving / syncing) is implemented at the call site (e.g. ListeningView
// wraps the mark in an Animated.View with a scale loop), not inside this
// component — same rationale as before: Animated.View on the wrapper is
// trivial and works everywhere without extra deps.

interface PaletteResolved {
  bg: string | null // null = no fill (transparent — caller's wrapper provides bg)
  /** Coin fill. 'gradient' renders the hero radial gradient. */
  coin: string
  /** Wave stroke color. Null = no waves (silhouette-only variants). */
  wave: string | null
  outline?: boolean
}

const TOKENS = {
  ink: '#1B1915',
  cream: '#FBFAF7',
  sage: '#3F5A3E',
  stone: '#F5F2EB',
  tintedFg: '#A2B2A1',
} as const

/**
 * Coin diameter as a fraction of the tile it sits on — Apple's app-icon
 * keyline circle (768/1024). The App Store icon, the desktop .icns, the
 * favicon (assets/brand/*.svg) and this in-app tile all use it, so the
 * mark on the sign-in screen is the mark on the home screen. Until Aug 16
 * 2026 the tile inset the mark 19% per side, leaving a 48% coin — the
 * "logo looks zoomed out" the owner flagged across every surface.
 */
export const COIN_TILE_RATIO = 0.75
/** Coin diameter on the mark's own 160-unit grid (r=62). */
const COIN_GRID_RATIO = 124 / 160

function resolveVariant(variant: MurmurVariant): PaletteResolved {
  switch (variant) {
    case 'cream':
      return { bg: TOKENS.cream, coin: 'gradient', wave: TOKENS.cream }
    case 'sage':
      return { bg: TOKENS.sage, coin: TOKENS.cream, wave: TOKENS.sage }
    case 'ink':
      return { bg: TOKENS.ink, coin: TOKENS.cream, wave: TOKENS.ink }
    case 'tinted':
      return { bg: TOKENS.ink, coin: TOKENS.tintedFg, wave: null }
    case 'cream-accent':
      return { bg: TOKENS.cream, coin: TOKENS.ink, wave: TOKENS.sage }
    case 'stone':
      return { bg: TOKENS.stone, coin: TOKENS.sage, wave: TOKENS.stone }
    case 'outline':
      return { bg: TOKENS.cream, coin: TOKENS.ink, wave: TOKENS.ink, outline: true }
    case 'mono-ink':
      return { bg: null, coin: TOKENS.ink, wave: null }
    case 'mono-cream':
      return { bg: null, coin: TOKENS.cream, wave: null }
  }
}

export function MurmurMark({
  size = 56,
  variant = 'cream',
  style,
}: MurmurMarkProps) {
  const palette = resolveVariant(variant)

  // On a tile, scale the 160-grid so the coin lands on the icon keyline
  // (COIN_TILE_RATIO of the tile). Bare marks (mono-*) fill `size`.
  const markSize = palette.bg ? size * (COIN_TILE_RATIO / COIN_GRID_RATIO) : size

  const gradient = palette.coin === 'gradient'
  const coinFill = gradient ? 'url(#murmurCoin)' : palette.coin

  const Waves =
    palette.wave === null ? null : (
      <>
        <Path
          d="M40 80 Q 55 64, 70 80 T 100 80 T 130 80"
          stroke={palette.wave}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          opacity={0.95}
        />
        <Path
          d="M40 96 Q 55 86, 70 96 T 100 96 T 120 96"
          stroke={palette.wave}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          opacity={0.45}
        />
      </>
    )

  const tile: ViewStyle | null = palette.bg
    ? {
        width: size,
        height: size,
        backgroundColor: palette.bg,
        borderRadius: size * 0.22,
        alignItems: 'center',
        justifyContent: 'center',
      }
    : null

  const Coin = (
    <Svg
      width={markSize}
      height={markSize}
      viewBox="0 0 160 160"
      style={tile ? undefined : style}
    >
      {gradient && (
        <Defs>
          <RadialGradient id="murmurCoin" cx="35%" cy="30%" r="90%">
            <Stop offset="0%" stopColor="#5C7B5A" />
            <Stop offset="100%" stopColor="#2D4530" />
          </RadialGradient>
        </Defs>
      )}
      {palette.outline ? (
        <>
          <Circle cx={80} cy={80} r={59} fill="none" stroke={palette.coin} strokeWidth={6} />
          {/* Outline variant keeps the primary wave only. */}
          <Path
            d="M40 80 Q 55 64, 70 80 T 100 80 T 130 80"
            stroke={palette.coin}
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <Circle cx={80} cy={80} r={62} fill={coinFill} />
          {gradient && (
            <>
              <Circle cx={80} cy={80} r={62} fill="none" stroke={TOKENS.cream} strokeWidth={1} opacity={0.18} />
              <Circle cx={80} cy={80} r={50} fill="none" stroke={TOKENS.cream} strokeWidth={1} opacity={0.18} />
            </>
          )}
          {Waves}
        </>
      )}
    </Svg>
  )

  if (tile) {
    return <View style={[tile, style]}>{Coin}</View>
  }
  return Coin
}
