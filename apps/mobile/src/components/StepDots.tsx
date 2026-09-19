import { StyleSheet, View } from 'react-native'
import { Colors } from '../theme'

/** Onboarding progress: one dot per step, the current one stretched.
 *  Replaces the "Step 1 of 2" labels (first-run audit L1). */
export function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: step + 1 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i === step && styles.current, i < step && styles.done]} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.ink4, opacity: 0.35 },
  current: { width: 22, backgroundColor: Colors.ink, opacity: 1 },
  done: { backgroundColor: Colors.accent, opacity: 1 },
})
