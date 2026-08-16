import { createContext, useContext, useEffect, useRef, useState, type ReactElement } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { Motion } from '../theme'

const PresenceContext = createContext<Animated.Value | null>(null)

/**
 * The layer's presence, 0 → 1. Enter runs 0→1 on `Motion.easeOut` over
 * `Motion.enterMs`; exit runs 1→0 on `Motion.easeIn` over `Motion.exitMs`.
 * Drive opacity / translate / scale from it — the value is native-driven.
 */
export function usePresence(): Animated.Value {
  const v = useContext(PresenceContext)
  if (!v) throw new Error('usePresence must be used inside <Presence>')
  return v
}

interface Props {
  visible: boolean
  /** A single root-level layer (typically `StyleSheet.absoluteFill`). */
  children: ReactElement | null
}

/**
 * Keeps a root-level layer mounted through its exit animation and hands
 * it a presence value to animate with.
 *
 * `{visible && <Layer/>}` unmounts on the very frame the state flips —
 * the layer vanishes with no exit motion, and it can't have an entrance
 * either because it has nothing to animate from. This wrapper instead:
 *
 *   • mounts the layer when `visible` turns true and runs presence 0→1;
 *   • when `visible` turns false, keeps rendering the *last element it was
 *     given while visible* (a React element is an immutable snapshot of
 *     props, so the layer's content freezes exactly as it was — the
 *     transcript, the parsed result — instead of blanking as the owner
 *     resets its state), runs presence 1→0, disables touches, and only
 *     then unmounts.
 *
 * Used by VoiceSessionProvider for the capture overlay and the result
 * sheet (docs/voice redesign, 14a–14c) so a mic tap glides in over the
 * current screen and a save glides out, rather than each surface being
 * thrown on and off the screen in one frame.
 */
export function Presence({ visible, children }: Props) {
  const [mounted, setMounted] = useState(visible)
  const progress = useRef(new Animated.Value(0)).current
  const lastChildren = useRef<ReactElement | null>(children)
  const running = useRef<Animated.CompositeAnimation | null>(null)
  if (visible) lastChildren.current = children

  useEffect(() => {
    running.current?.stop()
    if (visible) {
      setMounted(true)
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: Motion.enterMs,
        easing: Motion.easeOut,
        useNativeDriver: true,
      })
      running.current = anim
      anim.start()
    } else {
      const anim = Animated.timing(progress, {
        toValue: 0,
        duration: Motion.exitMs,
        easing: Motion.easeIn,
        useNativeDriver: true,
      })
      running.current = anim
      anim.start(({ finished }) => {
        if (finished) {
          setMounted(false)
          lastChildren.current = null
        }
      })
    }
  }, [visible, progress])

  if (!mounted || !lastChildren.current) return null
  return (
    <PresenceContext.Provider value={progress}>
      <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
        {lastChildren.current}
      </View>
    </PresenceContext.Provider>
  )
}
