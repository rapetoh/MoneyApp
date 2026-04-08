import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { merchantColor } from '@voice-expense/shared'
import { Typography } from '../theme'

interface Props {
  merchant: string | null
  size?: number
}

export function MerchantAvatar({ merchant, size = 44 }: Props) {
  const name = merchant ?? '?'
  const initial = name[0]?.toUpperCase() ?? '?'
  const bgColor = merchantColor(name)

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.38 }]}>{initial}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#FFFFFF',
    fontFamily: Typography.fontFamily.sansBold,
    lineHeight: undefined,
  },
})
