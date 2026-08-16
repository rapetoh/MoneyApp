import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Mirrors the system "Reduce Motion" switch (iOS Settings › Accessibility
 * › Motion; Android "Remove animations"). Surfaces that translate or scale
 * on entry check this and fall back to a plain fade — the same courtesy
 * every first-party sheet extends.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduce(v)
      })
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])
  return reduce
}
