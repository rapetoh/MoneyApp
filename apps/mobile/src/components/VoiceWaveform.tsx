import { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { Colors } from '../theme'

const BAR_COUNT = 5
const BAR_WIDTH = 4
const BAR_GAP = 4
const MIN_HEIGHT = 6
const MAX_HEIGHT = 36

interface Props {
  active: boolean
}

export function VoiceWaveform({ active }: Props) {
  const animations = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(MIN_HEIGHT)),
  ).current

  useEffect(() => {
    if (!active) {
      animations.forEach((anim) => {
        Animated.spring(anim, { toValue: MIN_HEIGHT, useNativeDriver: false }).start()
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
              backgroundColor: active ? Colors.primary : Colors.border,
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
