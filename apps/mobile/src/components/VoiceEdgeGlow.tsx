import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { Colors } from '../theme'

interface Props {
  /** Normalized mic level 0..1 — flares the inner halo as the user speaks. */
  level: Animated.Value
  /** True while actively listening; false (processing) settles the glow low. */
  active: boolean
}

// The 14a mockup's VoiceEdge is three stacked *inset box-shadows*:
//   A: inset 0 0 0 2.5px accent  +  inset 0 0 18px 3px  rgba(accent, .55)   — 1.7s, opacity .58↔1
//   B: inset 0 0 60px 14px rgba(accent, .30)                                — 2.3s, opacity .35↔.85
//   C: inset 0 0 120px 30px rgba(accent, .16)                               — 3.1s, opacity .25↔.70
// React Native has no inset shadow, and solid borders read as a picture
// frame (TestFlight build 9). Each shadow is approximated here as a stack
// of concentric SVG strokes whose alpha follows the shadow's gaussian
// falloff — edge-bright, feathering to nothing — so what renders is a
// glow bleeding in from the screen edge, not a band.

const ACCENT = Colors.accent ?? '#3F5A3E'

interface BandLayer {
  spread: number
  blur: number
  alpha: number
  bands: number
}

const TIGHT: BandLayer = { spread: 3, blur: 18, alpha: 0.55, bands: 7 }
const MID: BandLayer = { spread: 14, blur: 60, alpha: 0.3, bands: 10 }
const WIDE: BandLayer = { spread: 30, blur: 120, alpha: 0.16, bands: 12 }

const CORNER_RADIUS = Platform.OS === 'ios' ? 52 : 30

function bandStack(layer: BandLayer, w: number, h: number) {
  const extent = layer.spread + layer.blur
  const rects: { inset: number; width: number; alpha: number }[] = []
  for (let k = 0; k < layer.bands; k++) {
    const from = (extent * k) / layer.bands
    const to = (extent * (k + 1)) / layer.bands
    const mid = (from + to) / 2
    // Gaussian-ish falloff past the spread boundary — full strength inside
    // the spread, decaying through the blur zone.
    const alpha =
      mid <= layer.spread
        ? layer.alpha
        : layer.alpha * Math.exp(-3 * Math.pow((mid - layer.spread) / layer.blur, 2))
    if (alpha < 0.008) continue
    rects.push({ inset: mid, width: to - from + 0.75, alpha })
  }
  return rects.map((r, i) => (
    <Rect
      key={i}
      x={r.inset}
      y={r.inset}
      width={Math.max(0, w - r.inset * 2)}
      height={Math.max(0, h - r.inset * 2)}
      rx={Math.max(10, CORNER_RADIUS - r.inset)}
      fill="none"
      stroke={ACCENT}
      strokeWidth={r.width}
      strokeOpacity={r.alpha}
    />
  ))
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
  // layer's opacity off the mic amplitude buffer... same visual language,
  // actually reactive." A fourth copy of the tight halo, invisible in
  // silence, blooming with speech. Purely additive so the breathing
  // layers stay alive even on a device that emits no volume events.
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

  const tight = useMemo(() => bandStack(TIGHT, width, height), [width, height])
  const mid = useMemo(() => bandStack(MID, width, height), [width, height])
  const wide = useMemo(() => bandStack(WIDE, width, height), [width, height])

  const edgeLine = (
    <Rect
      x={1.25}
      y={1.25}
      width={width - 2.5}
      height={height - 2.5}
      rx={CORNER_RADIUS}
      fill="none"
      stroke={ACCENT}
      strokeWidth={2.5}
      strokeOpacity={1}
    />
  )

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityC }]} pointerEvents="none">
        <Svg width={width} height={height}>{wide}</Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityB }]} pointerEvents="none">
        <Svg width={width} height={height}>{mid}</Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityA }]} pointerEvents="none">
        <Svg width={width} height={height}>
          {edgeLine}
          {tight}
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: flare }]} pointerEvents="none">
        <Svg width={width} height={height}>{tight}</Svg>
      </Animated.View>
    </>
  )
}
