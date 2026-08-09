import { InputAccessoryView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Colors, Typography, Hairline } from '../theme'

/** Pass to every numeric `TextInput`'s `inputAccessoryViewID` that should
 *  share the one `<NumericAccessory>` rendered on the same screen. */
export const NUMERIC_ACCESSORY_ID = 'murmur-numeric-accessory'

interface NumericAccessoryProps {
  onDone: () => void
  doneLabel?: string
}

/**
 * Shared "Done" bar for `decimal-pad`/`number-pad` TextInputs. iOS gives
 * those keyboard types no dismiss key of their own — every screen with a
 * numeric field either had no way to close the keyboard or grew its own
 * one-off dismiss button. Render one of these per screen and reference it
 * from every numeric input on that screen:
 *
 *   <TextInput keyboardType="decimal-pad" inputAccessoryViewID={NUMERIC_ACCESSORY_ID} ... />
 *   <NumericAccessory onDone={() => Keyboard.dismiss()} />
 *
 * `InputAccessoryView` is iOS-only in React Native — Android's numeric
 * keyboards already carry a dismiss/done affordance, so this renders
 * nothing there rather than an inert wrapper.
 *
 * Adopting `inputAccessoryViewID` at existing numeric `TextInput`s across
 * the app is Stage 2 work; this is the shared bar they all point at.
 */
export function NumericAccessory({ onDone, doneLabel = 'Done' }: NumericAccessoryProps) {
  if (Platform.OS !== 'ios') return null

  return (
    <InputAccessoryView nativeID={NUMERIC_ACCESSORY_ID}>
      <View style={styles.bar}>
        <Pressable onPress={onDone} hitSlop={10}>
          <Text style={styles.doneText}>{doneLabel}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.surface2,
    borderTopWidth: Hairline.width,
    borderTopColor: Hairline.color,
  },
  doneText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    fontSize: 15,
    color: Colors.accent,
  },
})
