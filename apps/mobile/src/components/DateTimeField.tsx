import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Typography, Radius } from '../theme'
import { t, type Locale } from '@voice-expense/shared'

/**
 * When a transaction happened, as a field the user can actually change
 * (Sep 21, 2026).
 *
 * The owner's case: money is recorded on the day you think of it, not the
 * day it moved. A salary on the 7th entered on the 9th, a phone bill due
 * on the 14th set up today. The date is also what anchors a recurring
 * rule (migration 013 anchors `starts_at` to `transacted_at`), so a wrong
 * date does not just mislabel one row, it schedules every future one on
 * the wrong day.
 *
 * iOS gets Apple's own compact control: the pill shows the date and the
 * time, and tapping either opens the system calendar or clock popover.
 * Nothing about dates is reinvented here, which is the whole point:
 * people already know how this works. Android opens the platform dialogs
 * in sequence, date then time, which is that platform's convention.
 */
export function DateTimeField({
  value,
  onChange,
  locale,
  label,
}: {
  /** ISO instant. */
  value: string
  onChange: (iso: string) => void
  locale: Locale
  /** Defaults to the shared "Date & time" string. */
  label?: string
}) {
  const [androidBusy, setAndroidBusy] = useState(false)
  const date = new Date(value)
  const safe = Number.isNaN(date.getTime()) ? new Date() : date

  const openAndroid = () => {
    if (androidBusy) return
    setAndroidBusy(true)
    DateTimePickerAndroid.open({
      value: safe,
      mode: 'date',
      onChange: (_e, picked) => {
        if (!picked) {
          setAndroidBusy(false)
          return
        }
        DateTimePickerAndroid.open({
          value: picked,
          mode: 'time',
          is24Hour: locale !== 'en',
          onChange: (_e2, withTime) => {
            setAndroidBusy(false)
            if (withTime) onChange(withTime.toISOString())
          },
        })
      },
    })
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label ?? t('voice.date_time', locale)}</Text>
      {Platform.OS === 'ios' ? (
        <View style={styles.pickers}>
          <DateTimePicker
            value={safe}
            mode="date"
            display="compact"
            accentColor={Colors.accent}
            themeVariant="light"
            onChange={(_e, picked) => picked && onChange(picked.toISOString())}
          />
          <DateTimePicker
            value={safe}
            mode="time"
            display="compact"
            accentColor={Colors.accent}
            themeVariant="light"
            onChange={(_e, picked) => picked && onChange(picked.toISOString())}
          />
        </View>
      ) : (
        <Pressable
          onPress={openAndroid}
          style={({ pressed }) => [styles.androidValue, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={styles.androidText}>
            {safe.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
            {'  '}
            {safe.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}
          </Text>
          <Ionicons name="chevron-forward" size={15} color={Colors.textSecondary} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 44,
  },
  label: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  // The two compact pickers sit together, date then time, the way the
  // Calendar app pairs them.
  pickers: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  androidValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface2,
  },
  androidText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    color: Colors.ink ?? Colors.text,
  },
})
