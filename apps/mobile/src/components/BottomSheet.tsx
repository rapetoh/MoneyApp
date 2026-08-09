import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type KeyboardEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors, Typography, Hairline } from '../theme'

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
 * Keyboard strategy: rather than nesting a `KeyboardAvoidingView` inside the
 * sheet, this measures the sheet's real on-screen frame via
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
 * same lift math is correct regardless of what the sheet is mounted under.
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
  const sheetRef = useRef<View>(null)
  const lift = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!visible) return

    const liftToOverlap = (keyboardScreenY: number, duration: number) => {
      const node = sheetRef.current
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
        resetLift(e.duration ?? 200)
        return
      }
      liftToOverlap(e.endCoordinates.screenY, e.duration ?? 220)
    })
    const hideSub = Keyboard.addListener(hideEventName as 'keyboardDidHide', (e: KeyboardEvent) => {
      resetLift(e?.duration ?? 200)
    })

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [visible, lift])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          ref={sheetRef}
          style={[
            styles.sheetWrap,
            { maxHeight: windowHeight * maxHeightPercent },
            { transform: [{ translateY: Animated.multiply(lift, -1) }] },
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
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
