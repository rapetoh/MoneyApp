import { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { Colors } from '../theme'

const BAR_COUNT = 7
const BAR_WIDTH = 4
const BAR_GAP = 6
const MIN_HEIGHT = 6
const MAX_HEIGHT = 36

// Idle profile — fixed-height silhouette shown when not recording.
// Shape: short → tall → short (mimics a voice equalizer at rest).
const IDLE_HEIGHTS = [10, 18, 28, 36, 28, 18, 10]

interface Props {
  active: boolean
}

export function VoiceWaveform({ active }: Props) {
  const animations = useRef(
    IDLE_HEIGHTS.map((h) => new Animated.Value(h)),
  ).current

  useEffect(() => {
    if (!active) {
      // Settle bars back to their idle profile
      animations.forEach((anim, i) => {
        Animated.spring(anim, {
          toValue: IDLE_HEIGHTS[i],
          useNativeDriver: false,
        }).start()
      })
      return
    }

    const loops = animations.map((anim, i) => {
      const delay = i * 80
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.spring(anim, {
            toValue: MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT),
            useNativeDriver: false,
            speed: 6,
          }),
          Animated.spring(anim, {
            toValue: MIN_HEIGHT,
            useNativeDriver: false,
            speed: 6,
          }),
        ]),
      )
    })

    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [active, animations])

  return (
    <View style={styles.container}>
      {animations.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: anim,
              backgroundColor: Colors.primary,
              opacity: active ? 1 : 0.35,
            },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
    height: MAX_HEIGHT + 8,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
})
