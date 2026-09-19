import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { MerchantAvatar } from './MerchantAvatar'
import { useReduceMotion } from '../hooks/useReduceMotion'
import { Colors, Typography, Hairline } from '../theme'
import { t, formatMoney, type Locale } from '@voice-expense/shared'

/** Currencies whose minor unit is 0: "twelve fifty" reads as 1,250 there. */
const ZERO_DECIMAL = new Set(['JPY', 'XOF', 'XAF'])

const WORD_MS = 260
const HOLD_MS = 2600

/**
 * The welcome screen's demo (first-run audit H4): the product shown, not
 * described. A spoken sentence types itself in, then lands as a filed
 * expense card, in the user's language and currency, on a loop. Reduce
 * Motion shows the finished state, still.
 */
export function CaptureDemo({ locale, currency }: { locale: Locale; currency: string }) {
  const reduceMotion = useReduceMotion()
  const words = useMemo(() => t('welcome.demo_transcript', locale).split(' '), [locale])
  const [shown, setShown] = useState(reduceMotion ? words.length : 0)
  const card = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current
  const bars = useRef(Array.from({ length: 5 }, () => new Animated.Value(0.3))).current

  // Typing loop: words appear one by one, the card lands, hold, restart.
  useEffect(() => {
    if (reduceMotion) {
      setShown(words.length)
      card.setValue(1)
      return
    }
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const run = () => {
      if (cancelled) return
      setShown(0)
      card.setValue(0)
      words.forEach((_, i) => timers.push(setTimeout(() => !cancelled && setShown(i + 1), 500 + i * WORD_MS)))
      const landAt = 500 + words.length * WORD_MS + 250
      timers.push(
        setTimeout(() => {
          if (cancelled) return
          Animated.spring(card, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }).start()
        }, landAt),
      )
      timers.push(setTimeout(run, landAt + HOLD_MS))
    }
    run()
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [reduceMotion, words, card])

  // Waveform: five bars breathing out of phase while "listening".
  useEffect(() => {
    if (reduceMotion) return
    const loops = bars.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 360 + i * 70, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 360 + i * 70, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    )
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [bars, reduceMotion])

  const amount = ZERO_DECIMAL.has(currency) ? 1250 : 12.5
  const listening = shown < words.length

  return (
    <View style={styles.wrap} accessible accessibilityLabel={`${t('welcome.demo_transcript', locale)}. ${formatMoney(amount, currency, locale)}`}>
      <View style={styles.statusRow}>
        <View style={styles.bars}>
          {bars.map((v, i) => (
            <Animated.View
              key={i}
              style={[styles.bar, { transform: [{ scaleY: listening ? v : 0.3 }] }]}
            />
          ))}
        </View>
        <Text style={styles.status}>{listening ? t('listening.eyebrow', locale) : t('voice.saved', locale)}</Text>
      </View>

      <Text style={styles.transcript}>
        “{words.slice(0, shown).join(' ')}
        {listening ? <Text style={styles.cursor}>|</Text> : '”'}
      </Text>

      <Animated.View
        style={[
          styles.card,
          {
            opacity: card,
            transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          },
        ]}
      >
        <MerchantAvatar merchant={t('welcome.demo_merchant', locale)} size={38} radius={11} />
        <View style={{ flex: 1 }}>
          <Text style={styles.merchant}>{t('welcome.demo_merchant', locale)}</Text>
          <Text style={styles.category}>{t('welcome.demo_category', locale)}</Text>
        </View>
        <Text style={styles.amount}>{formatMoney(amount, currency, locale)}</Text>
        <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 28,
    padding: 18,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 18 },
  bar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.accent },
  status: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink3,
    fontFamily: Typography.fontFamily.sansBold,
  },
  transcript: {
    marginTop: 12,
    minHeight: 56,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 22,
    lineHeight: 28,
    fontStyle: 'italic',
    color: Colors.ink,
  },
  cursor: { color: Colors.accent, fontStyle: 'normal' },
  card: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  merchant: { fontSize: 15, color: Colors.ink, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  category: { marginTop: 1, fontSize: 12.5, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  amount: { fontFamily: Typography.fontFamily.serif, fontSize: 20, color: Colors.ink },
})
