import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
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

const FLOOR_SCALE = 0.18

/**
 * Voice-reactive waveform for the 14a capture overlay. The whole silhouette
 * breathes with the real mic level (`volumechange` events, ~80ms cadence),
 * smoothed through a single Animated value so the metering cadence never
 * causes React re-renders. If a platform never emits volume events (the
 * module supports them on both, but a device audio session can decline),
 * a gentle idle pulse takes over after 700ms of silence so the overlay
 * still visibly reads as "live".
 */
export function LiveWaveform({ level, active, height = 56 }: Props) {
  const smoothed = useRef(new Animated.Value(FLOOR_SCALE)).current
  const lastEventAt = useRef(0)

  useEffect(() => {
    if (!active) {
      Animated.timing(smoothed, { toValue: FLOOR_SCALE, duration: 220, useNativeDriver: true }).start()
      return
    }

    const sub = level.addListener(({ value }) => {
      lastEventAt.current = Date.now()
      Animated.timing(smoothed, {
        toValue: FLOOR_SCALE + value * (1 - FLOOR_SCALE),
        duration: 110,
        useNativeDriver: true,
      }).start()
    })

    // Idle-pulse fallback — only engages when no volume event has arrived
    // recently, so real metering always wins.
    let pulseUp = true
    const fallback = setInterval(() => {
      if (Date.now() - lastEventAt.current < 700) return
      pulseUp = !pulseUp
      Animated.timing(smoothed, {
        toValue: pulseUp ? 0.45 : 0.24,
        duration: 640,
        useNativeDriver: true,
      }).start()
    }, 700)

    return () => {
      level.removeListener(sub)
      clearInterval(fallback)
    }
  }, [active, level, smoothed])

  return (
    <View style={[styles.row, { height }]} pointerEvents="none">
      {SEED.map((s, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: Math.max(4, Math.round(s * height)),
              transform: [{ scaleY: smoothed }],
            },
          ]}
        />
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
