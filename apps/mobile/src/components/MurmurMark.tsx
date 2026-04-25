import { View, type ViewStyle } from 'react-native'
import Svg, { Path, Circle } from 'react-native-svg'

/**
 * Murmur — The Listening Drop.
 *
 * Brand mark per `docs/money-app/project/Murmur Brand Sheet.html` §01:
 * a speech-bubble droplet on a 160-unit grid, with an inner pulse (a single
 * dot + two concentric arcs) representing voice presence.
 *
 * Construction (do not modify without re-checking the brand sheet):
 * - Droplet path on a 160×160 viewBox with the tail in the lower-left
 *   quadrant. Optical center sits 4u above geometric center to compensate
 *   for tail mass.
 * - Inner pulse: dot r=6, arcs r=16 + 28, stroke widths 3.5 / 3, opacities
 *   0.85 / 0.45. Never add a 4th arc.
 *
 * Variants follow the six App Icon variants in §02 of the brand sheet.
 * Tinted (iOS-18 home-screen tinted mode) drops the inner pulse so the
 * silhouette can take the system tint.
 *
 * `breathing` enables a 2.6s ease-in-out scale 1↔1.08 loop on the inner
 * pulse, used during voice capture (record screen, splash). The brand
 * sheet's "Don't" rule applies: only animate when state is real (listening,
 * saving, syncing).
 */

const DROPLET_PATH =
  'M80 18 C 122 18, 142 50, 142 86 C 142 118, 116 142, 80 142 ' +
  'C 70 142, 60 140, 52 136 L 30 142 L 38 122 ' +
  'C 24 110, 18 96, 18 86 C 18 50, 38 18, 80 18 Z'

export type MurmurVariant =
  | 'cream' // default — ink droplet on cream background, cream inner pulse
  | 'sage' // brand — cream droplet on sage background, sage inner pulse
  | 'ink' // dark mode — cream droplet on ink background, ink inner pulse
  | 'tinted' // iOS 18 tinted — silhouette only, no inner pulse
  | 'cream-accent' // cream tile but the inner pulse is sage (accent)
  | 'stone' // sage droplet on stone background
  | 'outline' // outlined droplet, ink stroke + center dot, no arcs
  | 'mono-ink' // solid ink silhouette only — for ≤16px / favicon territory
  | 'mono-cream' // solid cream silhouette only — for use on dark backgrounds

interface MurmurMarkProps {
  size?: number
  variant?: MurmurVariant
  /** Optional outer style — width/height come from `size`. */
  style?: ViewStyle
}

// NOTE: Brand sheet §06 specifies a 2.6s breathing animation on the inner
// pulse for "real states" (listening / saving / syncing). That animation is
// implemented at the call site (e.g. ListeningView wraps the mark in an
// Animated.View with a scale loop), not inside this component — animating
// SVG `<G transform>` cleanly requires either react-native-reanimated or
// string-interpolation tricks, while Animated.View on the wrapper is
// trivial and works on every platform without extra deps.

interface PaletteResolved {
  bg: string | null // null = no fill (transparent — caller's wrapper provides bg)
  drop: string
  /** Inner-pulse fill / stroke color. Null = no inner pulse. */
  inner: string | null
  outline?: boolean
}

const TOKENS = {
  ink: '#1B1915',
  cream: '#FBFAF7',
  sage: '#3F5A3E',
  stone: '#F5F2EB',
  tintedFg: '#A2B2A1',
} as const

function resolveVariant(variant: MurmurVariant): PaletteResolved {
  switch (variant) {
    case 'cream':
      return { bg: TOKENS.cream, drop: TOKENS.ink, inner: TOKENS.cream }
    case 'sage':
      return { bg: TOKENS.sage, drop: TOKENS.cream, inner: TOKENS.sage }
    case 'ink':
      return { bg: TOKENS.ink, drop: TOKENS.cream, inner: TOKENS.ink }
    case 'tinted':
      return { bg: TOKENS.ink, drop: TOKENS.tintedFg, inner: null }
    case 'cream-accent':
      return { bg: TOKENS.cream, drop: TOKENS.ink, inner: TOKENS.sage }
    case 'stone':
      return { bg: TOKENS.stone, drop: TOKENS.sage, inner: TOKENS.stone }
    case 'outline':
      return {
        bg: TOKENS.cream,
        drop: TOKENS.ink,
        inner: TOKENS.ink,
        outline: true,
      }
    case 'mono-ink':
      return { bg: null, drop: TOKENS.ink, inner: null }
    case 'mono-cream':
      return { bg: null, drop: TOKENS.cream, inner: null }
  }
}

export function MurmurMark({
  size = 56,
  variant = 'cream',
  style,
}: MurmurMarkProps) {
  const palette = resolveVariant(variant)

  // The droplet itself — rendered on a transparent background by default.
  // Caller wraps in their own tile / circle for solid fills (the variant's
  // `bg` is rendered via a parent View when present, so we keep this SVG
  // a clean shape that can be scaled, recolored, or animated without
  // worrying about background bleed).
  const padding = palette.bg ? 0.19 : 0 // ≈19% inset when on a colored tile
  const inset = size * padding
  const dropSize = size - inset * 2

  const Inner =
    palette.inner === null ? null : (
      <>
        <Circle cx={80} cy={80} r={6} fill={palette.inner} />
        <Path
          d="M64 80 a16 16 0 0 1 32 0"
          stroke={palette.inner}
          strokeWidth={3.5}
          fill="none"
          strokeLinecap="round"
          opacity={0.85}
        />
        <Path
          d="M52 80 a28 28 0 0 1 56 0"
          stroke={palette.inner}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          opacity={0.45}
        />
      </>
    )

  // Tile wrapper: solid background + corner radius matching the brand sheet's
  // 22% radius (iOS will mask app-icon corners; this is the in-app tile look).
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

  const Droplet = (
    <Svg
      width={dropSize}
      height={dropSize}
      viewBox="0 0 160 160"
      style={tile ? undefined : style}
    >
      {palette.outline ? (
        <>
          <Path
            d={DROPLET_PATH}
            fill="none"
            stroke={palette.drop}
            strokeWidth={6}
          />
          {/* Outline variant keeps the dot only, per brand sheet §02 "Outline · alt". */}
          {palette.inner && (
            <Circle cx={80} cy={80} r={6} fill={palette.inner} />
          )}
        </>
      ) : (
        <>
          <Path d={DROPLET_PATH} fill={palette.drop} />
          {Inner}
        </>
      )}
    </Svg>
  )

  if (tile) {
    return <View style={[tile, style]}>{Droplet}</View>
  }
  return Droplet
}
