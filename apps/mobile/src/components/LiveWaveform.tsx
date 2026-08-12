import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { Colors } from '../theme'

interface Props {
  /** Normalized mic level 0..1 — `useVoice().volumeLevel`. */
  level: Animated.Value
  /** True while actively listening. When false the bars settle low. */
  active: boolean
  height?: number
}

// Static silhouette the bars scale inside — lifted from LiveWave in the
// 14a mockup (docs/voice redesign). 40 bars, values are height fractions.
const SEED = [
  0.35, 0.62, 0.28, 0.85, 0.44, 0.7, 0.95, 0.5, 0.33, 0.78,
  0.6, 0.42, 0.9, 0.55, 0.3, 0.68, 0.82, 0.4, 0.58, 0.72,
  1, 0.46, 0.36, 0.64, 0.88, 0.52, 0.3, 0.75, 0.6, 0.4,
  0.92, 0.48, 0.34, 0.7, 0.8, 0.44, 0.56, 0.66, 0.38, 0.86,
]

const SETTLED_SCALE = 0.28

/** One bar: its own perpetual scaleY loop (the mockup's `waveBar`
 *  keyframes — 0.28 ↔ 1, staggered duration and phase per bar), all on
 *  the native driver. `boost` multiplies on top so real mic level makes
 *  the whole field swell without ever being a precondition for motion. */
function Bar({ index, height, active, boost }: { index: number; height: number; active: boolean; boost: Animated.Value }) {
  const loop = useRef(new Animated.Value(SETTLED_SCALE)).current

  useEffect(() => {
    if (!active) {
      Animated.timing(loop, { toValue: SETTLED_SCALE, duration: 240, useNativeDriver: true }).start()
      return
    }
    // Mockup timing: 0.7s + (i % 5) * 0.14s per full cycle, phase-shifted
    // by (i % 7) * 70ms so neighboring bars never move in unison.
    const half = (700 + (index % 5) * 140) / 2
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(loop, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(loop, { toValue: SETTLED_SCALE, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    const starter = setTimeout(() => anim.start(), (index % 7) * 70)
    return () => {
      clearTimeout(starter)
      anim.stop()
    }
  }, [active, index, loop])

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          height: Math.max(4, Math.round(SEED[index % SEED.length] * height)),
          transform: [{ scaleY: Animated.multiply(loop, boost) }],
        },
      ]}
    />
  )
}

/**
 * Voice-reactive waveform for the 14a capture overlay. The bars dance
 * continuously while listening — motion is never gated on volume events
 * (build 8 gated everything on metering and read as frozen when a device
 * session declined to emit it). Real mic level, when it arrives, swells
 * the whole field via a shared amplitude multiplier.
 */
export function LiveWaveform({ level, active, height = 56 }: Props) {
  const boost = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!active) {
      boost.setValue(1)
      return
    }
    const sub = level.addListener(({ value }) => {
      Animated.timing(boost, {
        // Silence = 65% amplitude (still clearly alive), full voice = 120%.
        toValue: 0.65 + Math.min(Math.max(value, 0), 1) * 0.55,
        duration: 110,
        useNativeDriver: true,
      }).start()
    })
    return () => level.removeListener(sub)
  }, [active, level, boost])

  return (
    <View style={[styles.row, { height }]} pointerEvents="none">
      {SEED.map((_, i) => (
        <Bar key={i} index={i} height={height} active={active} boost={boost} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: Colors.accent ?? Colors.primary,
  },
})
