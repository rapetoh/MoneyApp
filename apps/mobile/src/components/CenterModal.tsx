import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type KeyboardEvent,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useReduceMotion } from '../hooks/useReduceMotion'
import { Colors, Typography, Motion } from '../theme'

export interface CenterModalProps {
  visible: boolean
  /** Backdrop tap, Android back, and the secondary button all land here. */
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** Primary action label, e.g. "Save". Omit for a read-only dialog. */
  primaryLabel?: string
  onPrimary?: () => void
  primaryDisabled?: boolean
  /** Shows a spinner in the primary button and blocks dismissal. */
  busy?: boolean
  /** Secondary label. Defaults to nothing; pass a localized "Cancel". */
  secondaryLabel?: string
  testID?: string
}

/**
 * A centered dialog: the app's second modal shape, next to BottomSheet.
 *
 * A bottom sheet is right when the content IS the task and wants the whole
 * screen (capture, pickers with long lists). A short, decisive form, "set a
 * budget", "add your income", reads better as a card floating over the
 * screen you came from: the context stays visible behind it, and the two
 * actions sit side by side at the bottom where neither can be clipped by a
 * long translation (owner report, Sep 19 2026: "Sauvegarder" wrapped onto
 * two lines in the sheet header).
 *
 * Motion mirrors BottomSheet's: the dim fades while the card rises a few
 * points and settles from 96%, and the Modal stays mounted until the exit
 * finishes. Reduce Motion gets the fade alone.
 *
 * The keyboard is handled by centring the card in the space that is left
 * above it, never by KeyboardAvoidingView's padding, which shoved the card
 * up under the status bar the moment a number pad appeared (owner report,
 * Sep 19 2026).
 */
export function CenterModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  busy,
  secondaryLabel,
  testID,
}: CenterModalProps) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const reduceMotion = useReduceMotion()
  const [mounted, setMounted] = useState(visible)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const dim = useRef(new Animated.Value(0)).current
  const card = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.parallel([
        Animated.timing(dim, {
          toValue: 1,
          duration: Motion.backdropInMs,
          easing: Motion.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(card, {
          toValue: 1,
          duration: reduceMotion ? Motion.backdropInMs : Motion.enterMs,
          easing: Motion.easeOut,
          useNativeDriver: true,
        }),
      ]).start()
      return
    }
    if (!mounted) return
    Animated.parallel([
      Animated.timing(dim, {
        toValue: 0,
        duration: Motion.backdropOutMs,
        easing: Motion.easeIn,
        useNativeDriver: true,
      }),
      Animated.timing(card, {
        toValue: 0,
        duration: Motion.exitMs,
        easing: Motion.easeIn,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false)
    })
  }, [visible, mounted, dim, card, reduceMotion])

  useEffect(() => {
    if (!mounted) return
    const onShow = (e: KeyboardEvent) => setKeyboardHeight(e.endCoordinates?.height ?? 0)
    const onHide = () => setKeyboardHeight(0)
    const show = Keyboard.addListener('keyboardWillShow', onShow)
    const showDid = Keyboard.addListener('keyboardDidShow', onShow)
    const hide = Keyboard.addListener('keyboardWillHide', onHide)
    const hideDid = Keyboard.addListener('keyboardDidHide', onHide)
    return () => {
      show.remove()
      showDid.remove()
      hide.remove()
      hideDid.remove()
    }
  }, [mounted])

  if (!mounted) return null

  const requestClose = () => {
    if (!busy) onClose()
  }

  const transform = reduceMotion
    ? []
    : [
        { scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        { translateY: card.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
      ]

  return (
    <Modal visible transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.dim, { opacity: dim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityElementsHidden />
        </Animated.View>

        {/* The visible area is the screen minus the keyboard; the card is
            centred inside it, with the top inset as a hard floor. */}
        <View
          style={[styles.center, { paddingTop: insets.top + 12, paddingBottom: keyboardHeight + 12 }]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.card,
              // Never taller than the screen minus its insets; the body
              // scrolls inside instead.
              {
                maxHeight:
                  windowHeight - insets.top - Math.max(keyboardHeight, insets.bottom) - 48,
                opacity: card,
                transform,
              },
            ]}
            accessibilityViewIsModal
            testID={testID}
          >
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>

            {(primaryLabel || secondaryLabel) && (
              <View style={styles.actions}>
                {secondaryLabel ? (
                  <Pressable
                    onPress={requestClose}
                    disabled={busy}
                    style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.secondaryLabel} numberOfLines={1}>
                      {secondaryLabel}
                    </Text>
                  </Pressable>
                ) : null}
                {primaryLabel ? (
                  <Pressable
                    onPress={onPrimary}
                    disabled={busy || primaryDisabled}
                    style={({ pressed }) => [
                      styles.primary,
                      (primaryDisabled || busy) && styles.primaryDisabled,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                  >
                    {busy ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      // One line, always: a long translation shrinks the
                      // type instead of wrapping or clipping.
                      <Text style={styles.primaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                        {primaryLabel}
                      </Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(27,25,21,0.32)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  card: {
    width: '100%',
    maxWidth: 400,
    // With the keyboard up the KeyboardAvoidingView shrinks the space
    // around the card; shrinking here (and in the body below) keeps the
    // dialog inside it instead of letting it overflow off-screen.
    flexShrink: 1,
    borderRadius: 28,
    backgroundColor: Colors.surface,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  title: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '500',
    color: Colors.ink,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13.5,
    lineHeight: 19,
    color: Colors.ink3,
    fontFamily: Typography.fontFamily.sans,
  },
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingTop: 18, paddingBottom: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  secondary: {
    height: 50,
    paddingHorizontal: 18,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: 15.5,
    color: Colors.ink3,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
  },
  primary: {
    flex: 1,
    height: 50,
    paddingHorizontal: 18,
    borderRadius: 25,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.45 },
  primaryLabel: {
    fontSize: 16,
    color: Colors.white,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
  },
  pressed: { opacity: 0.85 },
})
