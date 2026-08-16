import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { Image } from 'expo-image'
import { merchantColor, categoryPalette } from '@voice-expense/shared'
import { merchantLogoUrl } from '../services/merchantLogo'
import { Typography } from '../theme'

interface Props {
  merchant: string | null
  /** Optional domain hint from AI (e.g. "netflix.com") — used instead of guessing */
  merchantDomain?: string | null
  size?: number
  /**
   * Shape to render the logo with. Default circle. Pass a number to override
   * the radius directly (e.g. `radius={12}` for rounded-square tiles per
   * DESIGN.md's TxRow spec).
   */
  radius?: number
  /**
   * Category name used for the fallback tile when there's no merchant (e.g.
   * manually-entered expenses like "Rent"). The tile shows the first letter
   * of the category on the `categoryColor` background instead of a generic
   * `?` — that random `?` tile was visually noisy per user feedback.
   */
  categoryName?: string | null
  /** Hex color of the category. Used only when falling back to the category tile. */
  categoryColor?: string | null
}

export function MerchantAvatar({
  merchant,
  merchantDomain,
  size = 44,
  radius,
  categoryName,
  categoryColor,
}: Props) {
  const [logoFailed, setLogoFailed] = useState(false)
  // 0 until the logo has actually decoded, then fades to 1 — the letter
  // tile is the ONLY thing visible before that moment, and the logo (on
  // its own opaque white ground) fully covers it after. Build 13 drew the
  // logo directly over the coloured tile, so every favicon with a
  // transparent background showed the letter and colour bleeding through.
  const logoOpacity = useRef(new Animated.Value(0)).current

  // Reset the failed flag whenever the merchant or its domain changes. Without
  // this, a single transient error (e.g. first-paint race, flaky network on
  // cold app start) permanently locks the avatar into the letter fallback
  // even after the image would load fine on retry.
  useEffect(() => {
    setLogoFailed(false)
    logoOpacity.setValue(0)
  }, [merchant, merchantDomain, logoOpacity])

  // Decide what to show in the fallback tile. Priority:
  //   1. The merchant's first letter if we have a merchant name.
  //   2. Otherwise the category's first letter (e.g. "R" for Rent).
  //   3. Otherwise a question mark.
  const hasMerchant = !!merchant && merchant.trim().length > 0
  const hasCategory = !!categoryName && categoryName.trim().length > 0
  const fallbackSource = hasMerchant ? merchant! : hasCategory ? categoryName! : '?'
  const initial = fallbackSource[0]?.toUpperCase() ?? '?'

  // Fallback background color: category color when we're leaning on a
  // category (rent → housing color), run through `categoryPalette` for
  // its `fg` tone rather than painted raw. `categories.color` is an
  // arbitrary user-picked hex (the seeded defaults alone render white
  // text at 2.2–4.6:1 — under the 4.5:1 floor for six of twenty, e.g.
  // Subscriptions #F39C12 at 2.19:1) so the tile needs the same
  // guaranteed-≥4.5:1-vs-white derivation the chart tints use, not the
  // raw value (fix-plan 4.4 / audit 01-F28). Otherwise deterministic
  // merchant color, whose palette is chosen for the same guarantee.
  const bgColor = !hasMerchant && hasCategory && categoryColor
    ? categoryPalette(categoryColor).fg
    : merchantColor(fallbackSource)

  // Only attempt a favicon fetch when we actually have a merchant name. Using
  // the category as a domain guess (e.g. guessDomain("Rent") → "rent.com")
  // would point at unrelated websites and either 404 or show something wrong.
  const logoUrl = hasMerchant && !logoFailed ? merchantLogoUrl(merchant, merchantDomain) : null

  const borderRadius = radius ?? size / 2

  // Letter tile first; the logo mounts invisible on an opaque white ground,
  // and fades in only once expo-image reports it decoded (memory/disk
  // cached logos report within a frame or two, so the tile is a beat, not
  // a flash). A failed fetch leaves the tile — never a broken image, never
  // a letter under a logo.
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius, backgroundColor: bgColor },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.38 }]}>{initial}</Text>
      {logoUrl && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.logoGround, { borderRadius, opacity: logoOpacity }]}>
          <Image
            source={{ uri: logoUrl }}
            style={[StyleSheet.absoluteFill, { borderRadius }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            onLoad={() => {
              Animated.timing(logoOpacity, { toValue: 1, duration: 140, useNativeDriver: true }).start()
            }}
            onError={() => setLogoFailed(true)}
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    color: '#FFFFFF',
    fontFamily: Typography.fontFamily.sansBold,
    lineHeight: undefined,
  },
  // Opaque ground under the logo — favicons are frequently transparent.
  logoGround: {
    backgroundColor: '#FFFFFF',
  },
})
