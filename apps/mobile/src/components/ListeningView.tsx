import { useEffect, useMemo, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Money } from './Money'
import { Colors, Typography } from '../theme'
import { t, type Locale } from '@voice-expense/shared'

interface Props {
  /** The live interim transcript coming out of useVoice. */
  transcript: string
  /** Hint chips derived from interim parsing: [merchant?, category?]. Pass [] if none. */
  detectedChips?: Array<{ label: string; tone?: 'accent' | 'muted' }>
  /** True during active speech recognition. False during "processing". */
  active: boolean
  /** Called when the user taps the close pill. */
  onCancel: () => void
  /** Called when the user taps the stop square. */
  onStop: () => void
  locale: Locale
}

// Bar heights lifted from BigWaveform in docs/money-app/project/mobile-screens-1.jsx.
// 32 bars; first 65% render in sage (the "heard" portion), rest in muted ink.
const BAR_HEIGHTS = [
  8, 14, 22, 30, 44, 58, 38, 24, 52, 68, 44, 32, 56, 72, 50, 36,
  60, 44, 28, 46, 64, 38, 22, 30, 48, 62, 42, 28, 16, 24, 40, 30,
]
const ACTIVE_CUT = Math.floor(BAR_HEIGHTS.length * 0.65)

function BigWaveform() {
  return (
    <View style={waveformStyles.row}>
      {BAR_HEIGHTS.map((h, i) => {
        const isActive = i < ACTIVE_CUT
        return (
          <View
            key={i}
            style={[
              waveformStyles.bar,
              {
                height: h,
                backgroundColor: isActive
                  ? Colors.accent ?? Colors.primary
                  : Colors.ink4 ?? 'rgba(40,36,28,0.4)',
                opacity: isActive ? 1 : 0.4,
              },
            ]}
          />
        )
      })}
    </View>
  )
}

function BlinkingCursor() {
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, easing: Easing.step0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.step0, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])
  return <Animated.View style={[cursorStyles.cursor, { opacity }]} />
}

// Small pulsing sage dot with a soft accentSoft halo — the "live" indicator
// next to the "LISTENING" eyebrow.
function LiveDot() {
  const scale = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [scale])
  return (
    <View style={dotStyles.wrap}>
      <Animated.View style={[dotStyles.halo, { transform: [{ scale }] }]} />
      <View style={dotStyles.core} />
    </View>
  )
}

function DetectChip({ label, tone }: { label: string; tone?: 'accent' | 'muted' }) {
  const isAccent = tone === 'accent'
  const isMuted = tone === 'muted'
  return (
    <View
      style={[
        chipStyles.chip,
        isAccent && { backgroundColor: Colors.accentSoft ?? Colors.primaryLight, borderWidth: 0 },
        isMuted && { backgroundColor: '#EEEAE0', borderWidth: 0 },
      ]}
    >
      <Text
        style={[
          chipStyles.label,
          { color: isAccent ? Colors.accent ?? Colors.primary : Colors.ink ?? Colors.text },
          isMuted && { color: Colors.ink3 ?? Colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

// Quick numeric extraction from the transcript — used to populate the big
// "DETECTED" Money hero while the user is still speaking. This is a
// deliberately dumb regex (digits + decimals); spoken-out numbers like "twelve
// forty" are left to the server-side AI parse that fires after the user stops
// talking. A placeholder dash renders when we can't yet extract a number.
function extractAmount(text: string): number | null {
  if (!text) return null
  const match = text.match(/(\d+(?:[.,]\d{1,2})?)/)
  if (!match) return null
  const val = parseFloat(match[1].replace(',', '.'))
  return isNaN(val) || val <= 0 ? null : val
}

/**
 * Full-screen takeover matching `S_Listening` in
 * docs/money-app/project/mobile-screens-1.jsx.
 *
 * Rendered by the Record screen while `useVoice().state` is "listening" or
 * "processing". Swap-in for the usual voice/manual tab UI — after `onStop`
 * fires the hook transitions through "processing" → "done" and the existing
 * VoiceConfirmModal opens.
 *
 * Visual contract:
 *   - Sage pulsing live dot + "LISTENING" eyebrow, close pill top-right.
 *   - 92px serif Money hero showing a best-guess detected amount (or "—").
 *   - De-emphasized italic transcript with a blinking sage cursor at the end.
 *   - Up to 3 DetectChip entries (passed in by the caller).
 *   - 32-bar BigWaveform in sage + muted ink.
 *   - 84×84 dark ink stop button with an inset white rounded square.
 *   - "Processed on-device" footer with a small lock glyph.
 */
export function ListeningView({
  transcript,
  detectedChips = [],
  active,
  onCancel,
  onStop,
  locale,
}: Props) {
  const detectedAmount = useMemo(() => extractAmount(transcript), [transcript])

  return (
    <View style={styles.screen}>
      {/* Top row */}
      <View style={styles.topRow}>
        <View style={styles.liveWrap}>
          <LiveDot />
          <Text style={styles.liveLabel}>
            {active ? t('listening.eyebrow', locale) : t('listening.processing', locale)}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.closePill, pressed && styles.closePillPressed]}
          onPress={onCancel}
          hitSlop={8}
          accessibilityLabel={t('common.cancel', locale)}
        >
          <Ionicons name="close" size={16} color={Colors.ink2 ?? Colors.textSecondary} />
        </Pressable>
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{t('listening.detected', locale)}</Text>
        <View style={styles.heroAmount}>
          {detectedAmount != null ? (
            <Money value={detectedAmount} size={92} />
          ) : (
            <Text style={styles.heroPlaceholder}>$—</Text>
          )}
        </View>

        {/* Transcript — italic, de-emphasized, with blinking cursor at the end */}
        <View style={styles.transcriptRow}>
          <Text style={styles.transcriptText} numberOfLines={3}>
            {transcript ? `"${transcript}` : `"${t('listening.waiting', locale)}`}
          </Text>
          {active && <BlinkingCursor />}
          <Text style={styles.transcriptText}>"</Text>
        </View>
      </View>

      {/* Detect chips */}
      {detectedChips.length > 0 && (
        <View style={styles.chipsRow}>
          {detectedChips.map((c, i) => (
            <DetectChip key={`${c.label}-${i}`} label={c.label} tone={c.tone} />
          ))}
        </View>
      )}

      {/* Spacer pushes waveform + stop to the bottom */}
      <View style={{ flex: 1 }} />

      {/* Waveform + stop button */}
      <View style={styles.bottom}>
        <BigWaveform />
        <Pressable
          style={({ pressed }) => [styles.stopButton, pressed && styles.stopButtonPressed]}
          onPress={onStop}
          hitSlop={12}
          accessibilityLabel={t('voice.tap_to_stop', locale)}
        >
          <View style={styles.stopSquare} />
        </Pressable>
        <View style={styles.footer}>
          <Ionicons name="lock-closed" size={12} color={Colors.ink3 ?? Colors.textSecondary} />
          <Text style={styles.footerText}>{t('listening.processed_on_device', locale)}</Text>
        </View>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveLabel: {
    color: Colors.ink4 ?? Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  closePill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEEAE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePillPressed: { opacity: 0.6 },

  // Hero
  hero: {
    paddingHorizontal: 28,
    paddingTop: 56,
    alignItems: 'center',
  },
  heroLabel: {
    color: Colors.ink4 ?? Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  heroAmount: {
    marginTop: 10,
  },
  heroPlaceholder: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 92,
    fontWeight: '500',
    letterSpacing: -1.5,
    color: Colors.ink3 ?? Colors.textSecondary,
    lineHeight: 96,
  },
  transcriptRow: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  transcriptText: {
    fontFamily: Typography.fontFamily.sans,
    fontStyle: 'italic',
    fontSize: 14,
    color: Colors.ink3 ?? Colors.textSecondary,
    lineHeight: 20,
  },

  chipsRow: {
    paddingHorizontal: 24,
    paddingTop: 28,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },

  // Bottom
  bottom: {
    paddingHorizontal: 20,
    paddingBottom: 110,
    alignItems: 'center',
    gap: 36,
  },
  stopButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.ink ?? '#1B1915',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 10,
  },
  stopButtonPressed: { opacity: 0.85 },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
  },
})

const waveformStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 110,
    gap: 5,
  },
  bar: {
    width: 5,
    borderRadius: 2.5,
  },
})

const cursorStyles = StyleSheet.create({
  cursor: {
    width: 2,
    height: 13,
    backgroundColor: Colors.accent ?? Colors.primary,
    marginLeft: 2,
    alignSelf: 'center',
  },
})

const dotStyles = StyleSheet.create({
  wrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
  },
  core: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.accent ?? Colors.primary,
  },
})

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: 'rgba(40,36,28,0.08)',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
})
