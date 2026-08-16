import { useEffect, useRef } from 'react'
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions } from 'react-native'
import Svg, { Defs, FeGaussianBlur, Filter, Rect } from 'react-native-svg'
import { Colors } from '../theme'

interface Props {
  /** Normalized mic level 0..1 — flares the inner halo as the user speaks. */
  level: Animated.Value
  /** True while actively listening; false (processing) settles the glow low. */
  active: boolean
}

// The 14a mockup's VoiceEdge is three stacked *inset box-shadows*:
//   A: inset 0 0 0 2.5px accent  +  inset 0 0 18px 3px  rgba(accent,.55) — 1.7s, opacity .58↔1
//   B: inset 0 0 60px 14px rgba(accent,.30)                               — 2.3s, opacity .35↔.85
//   C: inset 0 0 120px 30px rgba(accent,.16)                              — 3.1s, opacity .25↔.70
//
// Each one is rendered here the way a browser renders it: a stroke hugging
// the screen edge, Gaussian-blurred (react-native-svg's native
// FeGaussianBlur), so the color is strongest at the very edge and feathers
// smoothly to nothing inward. One continuous gradient per layer — no bands,
// no rings (the concentric-stroke approximation shipped in build 11 read as
// an onion). CSS blur radius ≈ 2 × Gaussian σ, so σ = blur / 2.

const ACCENT = Colors.accent ?? '#3F5A3E'
const CORNER = Platform.OS === 'ios' ? 54 : 32

/** A blurred rounded-rect stroke centred on the screen edge. Half of the
 *  stroke falls outside the viewport (clipped) — the inside half plus the
 *  blur is the inset shadow. */
function ShadowLayer({
  id,
  width,
  height,
  spread,
  blur,
  alpha,
}: {
  id: string
  width: number
  height: number
  spread: number
  blur: number
  alpha: number
}) {
  const strokeWidth = spread * 2 + blur * 0.6
  const sigma = blur / 2
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <Filter id={id} x="-25%" y="-25%" width="150%" height="150%">
          <FeGaussianBlur stdDeviation={sigma} />
        </Filter>
      </Defs>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={CORNER}
        ry={CORNER}
        fill="none"
        stroke={ACCENT}
        strokeOpacity={alpha}
        strokeWidth={strokeWidth}
        filter={`url(#${id})`}
      />
    </Svg>
  )
}

function useBreathing(min: number, max: number, durationMs: number, active: boolean) {
  const value = useRef(new Animated.Value(max)).current
  useEffect(() => {
    if (!active) {
      Animated.timing(value, { toValue: min * 0.7, duration: 300, useNativeDriver: true }).start()
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: min, duration: durationMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: max, duration: durationMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [value, min, max, durationMs, active])
  return value
}

export function VoiceEdgeGlow({ level, active }: Props) {
  const { width, height } = useWindowDimensions()

  const opacityA = useBreathing(0.58, 1, 1700, active)
  const opacityB = useBreathing(0.35, 0.85, 2300, active)
  const opacityC = useBreathing(0.25, 0.7, 3100, active)

  // Voice flare — the design bundle's own note: "drive the innermost
  // layer's opacity off the mic amplitude buffer". A second copy of the
  // tight halo that is invisible in silence and blooms with speech; purely
  // additive so the breathing layers stay alive on a device that emits no
  // volume events.
  const flare = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!active) {
      flare.setValue(0)
      return
    }
    const sub = level.addListener(({ value }) => {
      Animated.timing(flare, {
        toValue: Math.min(Math.max(value, 0), 1) * 0.9,
        duration: 90,
        useNativeDriver: true,
      }).start()
    })
    return () => {
      level.removeListener(sub)
      flare.setValue(0)
    }
  }, [active, level, flare])

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityC }]} pointerEvents="none">
        <ShadowLayer id="glowC" width={width} height={height} spread={30} blur={120} alpha={0.16} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityB }]} pointerEvents="none">
        <ShadowLayer id="glowB" width={width} height={height} spread={14} blur={60} alpha={0.3} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityA }]} pointerEvents="none">
        <ShadowLayer id="glowA" width={width} height={height} spread={3} blur={18} alpha={0.55} />
        {/* The crisp 2.5px edge line — unblurred. */}
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Rect
            x={1.25}
            y={1.25}
            width={width - 2.5}
            height={height - 2.5}
            rx={CORNER}
            ry={CORNER}
            fill="none"
            stroke={ACCENT}
            strokeWidth={2.5}
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: flare }]} pointerEvents="none">
        <ShadowLayer id="glowFlare" width={width} height={height} spread={4} blur={26} alpha={0.6} />
      </Animated.View>
    </>
  )
}
