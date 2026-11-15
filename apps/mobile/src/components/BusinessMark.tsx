import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { businessIcon, isBusinessLogo, type Business } from '@voice-expense/shared'
import { Colors } from '../theme'

/**
 * A business's face (migration 045, docs/businesses.md): the uploaded logo
 * when there is one, otherwise its icon (stored, or the one the name
 * suggests) in sage on the sage-soft tile. Never a letter.
 *
 * Rounded square at about 28% of the size, the same shape at every scale
 * from the 14pt meta-line mark to the 44pt header card. Decorative: the
 * business name always sits next to it, so it stays out of VoiceOver.
 */
export function BusinessMark({
  business,
  size = 32,
}: {
  business: Pick<Business, 'name' | 'logo' | 'icon'>
  size?: number
}) {
  const logo = isBusinessLogo(business.logo) ? business.logo : null
  // A logo that fails to decode falls back to the icon, never a blank tile.
  // Remembered per logo, so a new upload gets its own chance.
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const logoFailed = logo !== null && failedLogo === logo

  const borderRadius = Math.round(size * 0.28)
  const frame = { width: size, height: size, borderRadius }

  if (logo && !logoFailed) {
    return (
      <View style={[styles.tile, frame]} accessible={false} importantForAccessibility="no">
        <Image
          source={{ uri: logo }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          contentFit="cover"
          // A data URL is its own bytes: keep the decoded image in memory,
          // never write a second copy to the disk cache.
          cachePolicy="memory"
          transition={0}
          onError={() => setFailedLogo(logo)}
          accessibilityIgnoresInvertColors
        />
      </View>
    )
  }

  return (
    <View style={[styles.tile, frame]} accessible={false} importantForAccessibility="no">
      <Ionicons
        name={`${businessIcon(business)}-outline`}
        size={Math.max(9, Math.round(size * 0.58))}
        color={Colors.primary}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
