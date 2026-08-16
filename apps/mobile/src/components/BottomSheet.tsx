import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Keyboard,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors, Typography, Hairline, Motion } from '../theme'

export interface BottomSheetProps {
  visible: boolean
  /** Called from the backdrop tap, the header Cancel, and Android back —
   *  all three routes are wired to this single callback so they can never
   *  diverge (see F14: 8 of 11 `<Modal>`s had no `onRequestClose`, and F18:
   *  the Insights month sheet dismissed on its own padding by accident). */
  onClose: () => void
  title?: string
  /** Header-left label. Defaults to "Cancel" — pass a localized string. */
  cancelLabel?: string
  /** Header-right slot — typically a "Done"/"Save" `<Pressable>`. Omit for
   *  a Cancel-only sheet (e.g. a picker where selecting a row closes it). */
  headerRight?: ReactNode
  /** Rendered outside the scrollable body, pinned to the sheet's bottom and
   *  padded by the safe area — for a primary action that must never scroll
   *  out of reach (see F23: Save landing below the fold). */
  footer?: ReactNode
  children: ReactNode
  scrollViewProps?: Partial<ScrollViewProps>
  contentContainerStyle?: StyleProp<ViewStyle>
  /** Cap as a fraction of window height. Default 0.86. */
  maxHeightPercent?: number
  testID?: string
}

/**
 * The one bottom-sheet implementation for the app.
 *
 * Owns backdrop, handle, header (Cancel / title / right slot), a
 * `flexShrink: 1` scrollable body, an optional pinned footer,
 * `useSafeAreaInsets().bottom` padding, and `onRequestClose` wired to the
 * same `onClose` as the backdrop press and the header Cancel.
 *
 * Motion (Aug 16 2026): the RN `<Modal>` is used purely as a host window
 * (`animationType="none"`) and the sheet drives its own choreography from
 * `src/theme/motion.ts` — the dim *fades* in while the sheet *slides* up,
 * and on close the dim fades out while the sheet slides down, the modal
 * staying mounted until both finish. `animationType="slide"` animated the
 * whole modal view, backdrop included, so the black dim visibly travelled
 * up and down with the sheet on every open/close. `visible` is still the
 * only control call sites own; the internal `mounted` state lags it by
 * exactly one exit animation.
 *
 * Keyboard strategy: rather than nesting a `KeyboardAvoidingView` inside the
 * sheet, this measures the real on-screen frame of the sheet's host (the
 * untransformed, bottom-aligned window the sheet rests in) via
 * `measureInWindow` on every `keyboardWillChangeFrame` (iOS) /
 * `keyboardDidShow` (Android) and translates the sheet up by exactly the
 * overlap. RN's `KeyboardAvoidingView` computes its lift from
 * `frame.y + frame.height - keyboardScreenY`, where `frame` is captured by
 * `onLayout` and is **parent-relative** — a KAV mounted inside a sheet whose
 * parent is `{ justifyContent: 'flex-end' }` has `frame.y === 0` while its
 * true screen origin is `screenHeight - sheetHeight`, so it under-lifts by
 * exactly the sheet's own top offset (~244pt on an iPhone 14 for a
 * content-sized sheet). See
 * docs/audit-2026-08-08/01-mobile-ui-and-layout.md F37 for the mechanism
 * and the three call sites it broke. `measureInWindow` reads the actual
 * window-space frame instead of trusting a relative layout event, so the
 * same lift math is correct regardless of what the sheet is mounted under
 * — and measuring the host rather than the sheet keeps it correct while
 * the sheet is still sliding in (an `autoFocus` field raises the keyboard
 * mid-entrance).
 *
 * Adoption at existing call sites (VoiceConfirmModal, the record
 * More-options sheet, IncomeEditorModal, the Insights month picker,
 * CategoryPicker, the settings pickers) is Stage 2 work — this component
 * only has to exist and be correct first.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  cancelLabel = 'Cancel',
  headerRight,
  footer,
  children,
  scrollViewProps,
  contentContainerStyle,
  maxHeightPercent = 0.86,
  testID,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const hostRef = useRef<View>(null)
  const lift = useRef(new Animated.Value(0)).current
  // Window-space top edge of the keyboard while it is showing, else null.
  // Caps the sheet's height (below) so a tall sheet *shrinks* to fit above
  // the keyboard instead of being translated until its header — Cancel /
  // title / Save — leaves the screen. Lifting alone is only correct for a
  // sheet shorter than the space above the keyboard.
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null)

  // ── Presentation choreography ──────────────────────────────────────────
  // `mounted` keeps the Modal up through the exit animation. `translateY`
  // starts a full window below the fold and only moves once the sheet has
  // reported its real height, so it always travels exactly its own height
  // — never a guessed constant.
  const [mounted, setMounted] = useState(visible)
  const translateY = useRef(new Animated.Value(windowHeight)).current
  const backdrop = useRef(new Animated.Value(0)).current
  const sheetHeight = useRef<number | null>(null)
  const pendingOpen = useRef(false)
  const running = useRef<Animated.CompositeAnimation | null>(null)

  const animateTo = useCallback(
    (open: boolean, onEnd?: () => void) => {
      running.current?.stop()
      const anim = Animated.parallel([
        Animated.timing(backdrop, {
          toValue: open ? 1 : 0,
          duration: open ? Motion.backdropInMs : Motion.backdropOutMs,
          easing: Motion.easeInOut,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: open ? 0 : (sheetHeight.current ?? windowHeight),
          duration: open ? Motion.enterMs : Motion.exitMs,
          easing: open ? Motion.easeOut : Motion.easeIn,
          useNativeDriver: true,
        }),
      ])
      running.current = anim
      anim.start(({ finished }) => {
        if (running.current === anim) running.current = null
        if (finished) onEnd?.()
      })
    },
    [backdrop, translateY, windowHeight],
  )

  useEffect(() => {
    if (visible) {
      if (mounted && sheetHeight.current != null) {
        // Re-opened while still mounted (e.g. mid-close): continue from
        // wherever the sheet currently is.
        animateTo(true)
      } else {
        // Fresh open: wait for the sheet's own layout to learn its height.
        pendingOpen.current = true
        setMounted(true)
      }
    } else if (mounted) {
      pendingOpen.current = false
      animateTo(false, () => {
        sheetHeight.current = null
        // Park a full window below the fold again, so the next open's first
        // frame (before its own layout reports a height) can't peek a
        // taller sheet above the bottom edge.
        translateY.setValue(windowHeight)
        setMounted(false)
      })
    }
    // `mounted` is deliberately not a dependency: this effect reacts to
    // the caller's `visible`, and the mounted flag is its own output.
  }, [visible, animateTo, translateY, windowHeight])

  const handleSheetLayout = (e: LayoutChangeEvent) => {
    sheetHeight.current = e.nativeEvent.layout.height
    if (pendingOpen.current) {
      pendingOpen.current = false
      translateY.setValue(sheetHeight.current)
      animateTo(true)
    }
  }

  useEffect(() => {
    if (!visible) {
      setKeyboardTop(null)
      return
    }

    const liftToOverlap = (keyboardScreenY: number, duration: number) => {
      // Measure the *host*, not the sheet: the sheet is bottom-aligned in
      // the host and carries the entrance/lift transforms, so its own
      // window frame is wrong for as long as it is still sliding in (an
      // `autoFocus` input raises the keyboard mid-entrance). The host is
      // untransformed and its bottom edge is exactly where the sheet's
      // bottom edge comes to rest — on both platforms, including
      // Android's adjustResize, where the host itself shrinks.
      const node = hostRef.current
      if (!node) return
      node.measureInWindow((_x, y, _width, height) => {
        const sheetBottomY = y + height
        const overlap = Math.max(sheetBottomY - keyboardScreenY, 0)
        Animated.timing(lift, {
          toValue: overlap,
          duration: Math.max(duration, 1),
          useNativeDriver: true,
        }).start()
      })
    }

    const resetLift = (duration: number) => {
      Animated.timing(lift, {
        toValue: 0,
        duration: Math.max(duration, 1),
        useNativeDriver: true,
      }).start()
    }

    // iOS: `keyboardWillChangeFrame` fires for show, hide, and any frame
    // change (e.g. QuickType bar toggling) — the height tells show from
    // hide. Android has no "will" phase and no reliable frame event, so it
    // falls back to `keyboardDidShow`/`keyboardDidHide` (post-animation,
    // but Android's own keyboard transition has no comparable JS hook).
    const showEventName = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow'
    const hideEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const showSub = Keyboard.addListener(showEventName as 'keyboardDidShow', (e: KeyboardEvent) => {
      if (e.endCoordinates.height <= 0) {
        setKeyboardTop(null)
        resetLift(e.duration ?? 200)
        return
      }
      LayoutAnimation.configureNext(LayoutAnimation.create(
        Math.max(e.duration ?? 220, 1),
        LayoutAnimation.Types.keyboard,
        LayoutAnimation.Properties.opacity,
      ))
      setKeyboardTop(e.endCoordinates.screenY)
      liftToOverlap(e.endCoordinates.screenY, e.duration ?? 220)
    })
    const hideSub = Keyboard.addListener(hideEventName as 'keyboardDidHide', (e: KeyboardEvent) => {
      LayoutAnimation.configureNext(LayoutAnimation.create(
        Math.max(e?.duration ?? 200, 1),
        LayoutAnimation.Types.keyboard,
        LayoutAnimation.Properties.opacity,
      ))
      setKeyboardTop(null)
      resetLift(e?.duration ?? 200)
    })

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [visible, lift])

  // With the keyboard up, the sheet may be at most the space between the
  // top safe area and the keyboard — it then lifts by exactly the keyboard
  // height, landing its top at (or below) the safe area and its bottom on
  // the keyboard's edge, header always visible, body still scrollable.
  const maxHeight = keyboardTop == null
    ? windowHeight * maxHeightPercent
    : Math.min(windowHeight * maxHeightPercent, keyboardTop - insets.top - 8)

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      testID={testID}
    >
      <Pressable ref={hostRef} style={styles.host} onPress={onClose} accessibilityRole="none">
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdrop }]} />
        <Animated.View
          onLayout={handleSheetLayout}
          style={[
            styles.sheetWrap,
            { maxHeight },
            { transform: [{ translateY: Animated.add(translateY, Animated.multiply(lift, -1)) }] },
          ]}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>

            {(title || headerRight) && (
              <View style={styles.header}>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Text style={styles.navText}>{cancelLabel}</Text>
                </Pressable>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                <View style={styles.headerRightSlot}>{headerRight}</View>
              </View>
            )}

            <ScrollView
              style={styles.body}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={[
                { paddingBottom: (footer ? 0 : insets.bottom) + 16 },
                contentContainerStyle,
              ]}
              {...scrollViewProps}
            >
              {children}
            </ScrollView>

            {footer && (
              <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>{footer}</View>
            )}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // The dim is its own layer so it can fade independently of the sheet's
  // slide (see the class doc). Warm ink, not pure black — the same family
  // as VoiceResultSheet's backdrop.
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(27,25,21,0.42)',
  },
  sheetWrap: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    // `flexShrink: 1` (not `flex: 1`) — the sheet sizes to its content up
    // to `sheetWrap`'s `maxHeight`, it does not claim all available space.
    flexShrink: 1,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.line,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  navText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    color: Colors.ink2,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    color: Colors.ink,
    marginHorizontal: 8,
  },
  headerRightSlot: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
  body: {
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: Hairline.width,
    borderTopColor: Hairline.color,
  },
})
