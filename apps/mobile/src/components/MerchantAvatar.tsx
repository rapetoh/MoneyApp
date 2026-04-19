import React, { useEffect, useState } from 'react'
import { View, Text, Image, StyleSheet, type ImageStyle } from 'react-native'
import { merchantColor } from '@voice-expense/shared'
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
}

// Well-known merchants whose domain can't be derived by stripping spaces.
const KNOWN_DOMAINS: Record<string, string> = {
  netflix: 'netflix.com',
  spotify: 'spotify.com',
  amazon: 'amazon.com',
  walmart: 'walmart.com',
  target: 'target.com',
  costco: 'costco.com',
  starbucks: 'starbucks.com',
  mcdonalds: 'mcdonalds.com',
  uber: 'uber.com',
  ubereats: 'ubereats.com',
  lyft: 'lyft.com',
  apple: 'apple.com',
  google: 'google.com',
  microsoft: 'microsoft.com',
  adobe: 'adobe.com',
  hulu: 'hulu.com',
  disneyplus: 'disneyplus.com',
  disney: 'disney.com',
  hbomax: 'hbomax.com',
  youtube: 'youtube.com',
  paypal: 'paypal.com',
  venmo: 'venmo.com',
  cashapp: 'cash.app',
  bestbuy: 'bestbuy.com',
  homedepot: 'homedepot.com',
  lowes: 'lowes.com',
  ikea: 'ikea.com',
  nike: 'nike.com',
  adidas: 'adidas.com',
  zara: 'zara.com',
  sephora: 'sephora.com',
  wholefoods: 'wholefoods.com',
  traderjoes: 'traderjoes.com',
  kroger: 'kroger.com',
  walgreens: 'walgreens.com',
  cvs: 'cvs.com',
  tmobile: 't-mobile.com',
  verizon: 'verizon.com',
  att: 'att.com',
  comcast: 'comcast.com',
  chipotle: 'chipotle.com',
  doordash: 'doordash.com',
  grubhub: 'grubhub.com',
  airbnb: 'airbnb.com',
  booking: 'booking.com',
  expedia: 'expedia.com',
  playstation: 'playstation.com',
  xbox: 'xbox.com',
  steam: 'steampowered.com',
  github: 'github.com',
  notion: 'notion.so',
  slack: 'slack.com',
  zoom: 'zoom.us',
  dropbox: 'dropbox.com',
  chickfila: 'chick-fil-a.com',
  burgerking: 'bk.com',
  wendys: 'wendys.com',
  dominos: 'dominos.com',
  pizzahut: 'pizzahut.com',
  subways: 'subway.com',
  subway: 'subway.com',
  dunkin: 'dunkindonuts.com',
  panera: 'panerabread.com',
}

function guessDomain(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return KNOWN_DOMAINS[normalized] ?? (normalized + '.com')
}

export function MerchantAvatar({ merchant, merchantDomain, size = 44, radius }: Props) {
  const [logoFailed, setLogoFailed] = useState(false)

  // Reset the failed flag whenever the merchant or its domain changes. Without
  // this, a single transient error (e.g. first-paint race, flaky network on
  // cold app start) permanently locks the avatar into the letter fallback
  // even after the image would load fine on retry. Chick-fil-A specifically
  // regressed after Phase D because the failure state persisted across
  // re-renders of the same row.
  useEffect(() => {
    setLogoFailed(false)
  }, [merchant, merchantDomain])

  const name = merchant ?? '?'
  const initial = name[0]?.toUpperCase() ?? '?'
  const bgColor = merchantColor(name)

  const domain = merchantDomain ?? (name !== '?' ? guessDomain(name) : null)
  const logoUrl = domain && !logoFailed
    ? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=128`
    : null

  const borderRadius = radius ?? size / 2

  if (logoUrl) {
    // `cover` (not `contain`) fills the full frame so the logo reads at small
    // sizes; favicons are square so no cropping occurs in practice, and it
    // prevents the "tiny logo floating in empty circle" look at 40px.
    const imageStyle: ImageStyle = {
      width: size,
      height: size,
      borderRadius,
      backgroundColor: '#FFFFFF',
    }
    return (
      <Image
        source={{ uri: logoUrl }}
        style={imageStyle}
        onError={() => setLogoFailed(true)}
        resizeMode="cover"
      />
    )
  }

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius, backgroundColor: bgColor },
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
