import { useEffect, useRef } from 'react'
import { Animated, View, Text, Pressable, StyleSheet, Easing } from 'react-native'
import { Colors, Typography, Spacing, Radius } from '../theme'

interface Props {
  message: string
  /** Called when the user taps Undo. Snackbar dismisses automatically after. */
  onUndo: () => void
  /** Called when the 4-second window elapses with no tap. */
  onDismiss: () => void
  /** Button text (defaults to "Undo" — the calling site passes a localized string). */
  undoLabel?: string
  /** Milliseconds until auto-dismiss. DESIGN.md §3 Motion specifies 4s. */
  durationMs?: number
}

/**
 * Dark pill snackbar floating above the tab bar. 4-second progress bar; Undo
 * reverses the just-performed action. Spec: docs/DESIGN.md §3 Motion +
 * §5 Today · Undo snackbar state.
 */
export function UndoSnackbar({
  message,
  onUndo,
  onDismiss,
  undoLabel = 'Undo',
  durationMs = 4000,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current
  const dismissed = useRef(false)

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !dismissed.current) {
        dismissed.current = true
        onDismiss()
      }
    })
    // We intentionally only start the timer on mount — identity of onDismiss
    // shouldn't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleUndo() {
    if (dismissed.current) return
    dismissed.current = true
    onUndo()
  }

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['100%', '0%'],
  })

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.pill}>
        <Text style={styles.message} numberOfLines={1}>
          {message}
        </Text>
        <Pressable onPress={handleUndo} hitSlop={8} style={({ pressed }) => pressed && styles.undoPressed}>
          <Text style={styles.undoLabel}>{undoLabel}</Text>
        </Pressable>
      </View>
      <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  // Floats above the tab bar (tab bar bottom = 14, height = 68 → clear above).
  container: {
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
    bottom: 14 + 68 + Spacing.sm,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.base,
    backgroundColor: Colors.ink ?? '#1B1915',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  message: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
  undoLabel: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.sm,
    color: Colors.accentSoft ?? Colors.primaryLight,
    letterSpacing: 0.4,
  },
  undoPressed: { opacity: 0.6 },
  progressBar: {
    height: 3,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    opacity: 0.9,
  },
})
