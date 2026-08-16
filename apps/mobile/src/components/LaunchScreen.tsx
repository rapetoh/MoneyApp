import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import launch from '../../assets/brand/launch'

const MARK = require('../../assets/splash-icon.png')

/**
 * If the mark's `onLoad` never fires (asset pipeline hiccup on some device),
 * hide the native splash anyway after this long — a launch that never gets
 * past the OS logo is the one failure mode worse than a visible seam.
 */
const NATIVE_HIDE_FALLBACK_MS = 1500

/**
 * How long after the app underneath has mounted before the veil starts to
 * lift — enough for the first screen to lay out and paint, so the reveal
 * never shows a half-built Today.
 */
const REVEAL_SETTLE_MS = 90

/**
 * Minimum time the mark stays up after the JS handoff, per the brand sheet
 * (§06 Splash: "hold for 800ms after first paint, fade out as the Today
 * screen draws in"). Only bites on a warm, fast launch — a slow one is
 * already past it by the time the gates clear. Without a floor the mark
 * would flash for a couple of frames on a fast device, which reads as a
 * glitch rather than a brand moment.
 */
const MIN_DWELL_MS = 800

/** Breathing loop — the same 2.6 s cadence the brand uses for every "real"
 *  waiting state (listening / saving / syncing). */
const BREATH_HALF_MS = 1300
const BREATH_SCALE = 1.045

const EXIT_MS = 360

interface Props {
  /** True once the app underneath is mounted — triggers the reveal. */
  ready: boolean
  /** Fired after the reveal finishes; the parent unmounts this layer. */
  onDone: () => void
}

/**
 * The launch handoff — the second half of the splash screen.
 *
 * The OS paints the native launch screen (storyboard / Android 12 splash)
 * from `app.config.js`: the Coin & Wave mark, `SPLASH_IMAGE_WIDTH` pt
 * wide, centered on cream. That layer is static by platform rule — iOS
 * launch storyboards cannot animate. This component draws the *identical*
 * frame in JS (same PNG, same width, same center, same cream — every value
 * comes from assets/brand/launch.js) and only once its own image has
 * decoded does it hide the native layer, so the swap is invisible.
 *
 * From there the mark breathes gently while fonts / session / data load
 * (nothing ever looks frozen), and when the app underneath is mounted the
 * mark lifts and the veil dissolves into the first screen — the same
 * logo → app choreography Cash App, Spotify and Claude use. Respects the
 * system Reduce Motion setting (fade only, no scale).
 *
 * Mounted once by app/_layout.tsx and kept mounted across the `ready`
 * flip — a remount would reload the image and restart the breath, which
 * would read as a flicker.
 */
export function LaunchScreen({ ready, onDone }: Props) {
  const veil = useRef(new Animated.Value(1)).current
  const markOpacity = useRef(new Animated.Value(1)).current
  const markScale = useRef(new Animated.Value(1)).current
  const breath = useRef<Animated.CompositeAnimation | null>(null)
  const nativeHidden = useRef(false)
  const paintedAt = useRef<number | null>(null)
  const exiting = useRef(false)
  const reduceMotion = useRef(false)
  // Touches are swallowed until the veil actually starts to lift — during
  // the settle/dwell the app underneath is mounted but invisible, and a
  // tap landing on an unseen button would be a nasty surprise.
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!alive) return
        reduceMotion.current = enabled
        if (enabled && breath.current) {
          // Answer arrived after the breath began — settle the mark.
          breath.current.stop()
          breath.current = null
          markScale.setValue(1)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [markScale])

  const startBreathing = useCallback(() => {
    if (breath.current || reduceMotion.current || exiting.current) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(markScale, {
          toValue: BREATH_SCALE,
          duration: BREATH_HALF_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(markScale, {
          toValue: 1,
          duration: BREATH_HALF_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    breath.current = loop
    loop.start()
  }, [markScale])

  // ── Native → JS handoff ──────────────────────────────────────────────
  const hideNative = useCallback(() => {
    if (nativeHidden.current) return
    nativeHidden.current = true
    paintedAt.current = Date.now()
    SplashScreen.hideAsync().catch(() => {})
    startBreathing()
  }, [startBreathing])

  useEffect(() => {
    const id = setTimeout(hideNative, NATIVE_HIDE_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [hideNative])

  // ── Reveal ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || exiting.current) return
    // The app is up: nothing may keep the OS logo on, and the dwell clock
    // needs a start time even if the mark's onLoad hasn't fired yet (the
    // bundled PNG is decoded long before fonts + data are, in practice).
    hideNative()
    exiting.current = true
    const shownFor = Date.now() - (paintedAt.current ?? Date.now())
    const delay = Math.max(REVEAL_SETTLE_MS, MIN_DWELL_MS - shownFor)
    const id = setTimeout(() => {
      setRevealing(true)
      breath.current?.stop()
      breath.current = null

      const fadeVeil = Animated.timing(veil, {
        toValue: 0,
        duration: EXIT_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
      const fadeMark = Animated.timing(markOpacity, {
        toValue: 0,
        duration: EXIT_MS * 0.7,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      })
      const anims = reduceMotion.current
        ? [fadeVeil, fadeMark]
        : [
            fadeVeil,
            fadeMark,
            Animated.timing(markScale, {
              toValue: 1.16,
              duration: EXIT_MS,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
          ]
      Animated.parallel(anims).start(() => onDone())
    }, delay)
    return () => clearTimeout(id)
    // `onDone` is a state setter from the parent; the reveal must run once.
  }, [ready, hideNative, veil, markOpacity, markScale])

  return (
    <Animated.View
      pointerEvents={revealing ? 'none' : 'auto'}
      style={[styles.veil, { opacity: veil }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="launch-screen"
    >
      <Animated.View style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}>
        <Image
          source={MARK}
          style={styles.mark}
          resizeMode="contain"
          // Android's RN Image cross-fades new bitmaps in over 300 ms by
          // default — that fade would be visible through the seam.
          fadeDuration={0}
          onLoad={hideNative}
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: launch.SPLASH_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    // Above every root-level layer (undo snackbar, voice overlay, sync
    // banner) — nothing may paint over the launch veil.
    zIndex: 1000,
    elevation: Platform.OS === 'android' ? 1000 : undefined,
  },
  mark: {
    width: launch.SPLASH_IMAGE_WIDTH,
    height: launch.SPLASH_IMAGE_WIDTH,
  },
})
