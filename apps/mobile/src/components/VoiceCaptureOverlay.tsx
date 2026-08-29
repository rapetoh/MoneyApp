import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LiveWaveform } from './LiveWaveform'
import { VoiceEdgeGlow } from './VoiceEdgeGlow'
import { usePresence } from './Presence'
import { useReduceMotion } from '../hooks/useReduceMotion'
import { Colors, Typography } from '../theme'
import { t, formatMoney, type Locale } from '@voice-expense/shared'

interface Props {
  /** 'listening' | 'processing' | 'error' — the overlay renders for all three. */
  phase: 'listening' | 'processing' | 'error'
  /** Live transcript (interim while speaking, final while processing). */
  transcript: string
  /** Raw error from useVoice — 'no-transcript' gets its localized copy here. */
  errorMessage: string | null
  volumeLevel: Animated.Value
  currencyCode: string
  locale: Locale
  onCancel: () => void
  onStop: () => void
  /** Cancel the recording and jump to the Quick entry keypad. */
  onKeyboard: () => void
  /** Error phase — start a fresh recording. */
  onRetry: () => void
}

/** Quick numeric read of the transcript — feeds the live amount chip while
 *  the user is still speaking. Deliberately dumb (digits + decimals only);
 *  spoken-out numbers like "twelve forty" are the server parse's job after
 *  the user stops. Everything else the mockup shows as live chips
 *  (merchant, category, expense/income) requires that parse, so those
 *  chips arrive with the result sheet instead. */
function extractAmount(text: string): number | null {
  if (!text) return null
  const match = text.match(/(\d+(?:[.,]\d{1,2})?)/)
  if (!match) return null
  const val = parseFloat(match[1].replace(',', '.'))
  return isNaN(val) || val <= 0 ? null : val
}

function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [scale])
  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.dotHalo, { transform: [{ scale }] }]} />
      <View style={styles.dotCore} />
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
  return <Animated.View style={[styles.cursor, { opacity }]} />
}

/** The live amount chip — rises in when a number is first heard. */
function AmountChip({ label }: { label: string }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [anim])
  return (
    <Animated.View
      style={[
        styles.amountChip,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
      ]}
    >
      <Text style={styles.amountChipText}>{label}</Text>
    </Animated.View>
  )
}

/**
 * 14a — voice capture in place. Rendered by VoiceSessionProvider as a
 * root-level layer above the navigator (no RN Modal, no navigation), so
 * tapping the mic FAB never leaves the screen the user was on.
 *
 * Entrance / exit come from the enclosing <Presence>: the cream scrim
 * fades up over the screen while the content rises a few points into
 * place; on cancel or when the parse lands, the reverse — so the mic tap
 * reads as the current screen receding under a listening surface, not as
 * a new screen thrown on top of it.
 */
export function VoiceCaptureOverlay({
  phase,
  transcript,
  errorMessage,
  volumeLevel,
  currencyCode,
  locale,
  onCancel,
  onStop,
  onKeyboard,
  onRetry,
}: Props) {
  const insets = useSafeAreaInsets()
  const presence = usePresence()
  const reduceMotion = useReduceMotion()
  const [elapsed, setElapsed] = useState(0)
  const listening = phase === 'listening'
  const rise = reduceMotion
    ? 0
    : presence.interpolate({ inputRange: [0, 1], outputRange: [22, 0] })

  useEffect(() => {
    if (!listening) return
    setElapsed(0)
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [listening])

  const detectedAmount = useMemo(() => extractAmount(transcript), [transcript])
  const timer = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  const errorCopy =
    errorMessage === 'no-transcript'
      ? t('voice.no_transcript', locale)
      : errorMessage ?? t('common.error', locale)

  return (
    <View style={styles.root}>
      {/* Scrim over whatever screen the user was on */}
      <Animated.View style={[styles.scrim, { opacity: presence }]} />

      {/* Reactive screen-edge glow — the mockup's three inset-shadow
          layers rendered as feathered SVG falloff (solid borders read as
          a picture frame - build 9's mistake). Inner halo flares with
          the mic level. */}
      {phase !== 'error' && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: presence }]} pointerEvents="none">
          <VoiceEdgeGlow level={volumeLevel} active={phase === 'listening'} />
        </Animated.View>
      )}

      <Animated.View
        style={[
          styles.content,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 18 },
          { opacity: presence, transform: [{ translateY: rise }] },
        ]}
      >
        {/* Status pill */}
        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            {phase === 'error' ? (
              <Ionicons name="alert-circle" size={14} color={Colors.destructive} />
            ) : (
              <PulsingDot />
            )}
            <Text style={styles.statusLabel}>
              {phase === 'error'
                ? t('common.error', locale)
                : listening
                  ? t('listening.eyebrow', locale)
                  : t('listening.processing', locale)}
            </Text>
            {listening && (
              <>
                <View style={styles.statusDivider} />
                <Text style={styles.statusTimer}>{timer}</Text>
              </>
            )}
          </View>
        </View>

        {/* Live transcript — the hero */}
        <View style={styles.transcriptWrap}>
          {phase === 'error' ? (
            <Text style={styles.errorText}>{errorCopy}</Text>
          ) : (
            <Text style={styles.transcriptText}>
              {transcript.length > 0 ? (
                <Text>{transcript}</Text>
              ) : (
                <Text style={styles.transcriptPlaceholder}>{t('listening.waiting', locale)}</Text>
              )}
              {listening && <BlinkingCursor />}
            </Text>
          )}
        </View>

        {/* Parsed-so-far — the amount is the one thing detectable on-device
            while speaking; merchant/category/type chips arrive with the
            result sheet once the real parse lands. */}
        <View style={styles.chipsRow}>
          {phase !== 'error' && detectedAmount != null && (
            <AmountChip label={formatMoney(detectedAmount, currencyCode, locale)} />
          )}
        </View>

        {/* Waveform */}
        <View style={styles.waveWrap}>
          {phase !== 'error' && <LiveWaveform level={volumeLevel} active={listening} />}
        </View>

        {/* Controls — cancel · stop/retry · keyboard */}
        <View style={styles.controlsRow}>
          <Pressable
            style={({ pressed }) => [styles.sideBtn, pressed && styles.pressed]}
            onPress={onCancel}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', locale)}
          >
            <Ionicons name="close" size={20} color={Colors.ink2} />
          </Pressable>

          {phase === 'error' ? (
            <Pressable
              style={({ pressed }) => [styles.stopBtn, pressed && styles.pressed]}
              onPress={onRetry}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.retry', locale)}
            >
              <Ionicons name="mic" size={30} color={Colors.white} />
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.stopBtn, pressed && styles.pressed]}
              onPress={onStop}
              disabled={phase === 'processing'}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('voice.tap_to_stop', locale)}
            >
              {phase === 'processing' ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <View style={styles.stopSquare} />
              )}
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [styles.sideBtn, pressed && styles.pressed]}
            onPress={onKeyboard}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('voice.type_instead', locale)}
          >
            <Ionicons name="keypad-outline" size={20} color={Colors.ink2} />
          </Pressable>
        </View>

        {/* Privacy footer — the audio itself never leaves the device */}
        <View style={styles.footer}>
          <Ionicons name="lock-closed" size={11} color={Colors.ink3} />
          <Text style={styles.footerText}>{t('listening.processed_on_device', locale)}</Text>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(251,250,247,0.96)',
  },
  content: {
    flex: 1,
  },
  statusRow: {
    alignItems: 'center',
    paddingTop: 14,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 0.5,
    borderColor: Colors.line,
    shadowColor: '#28241C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statusLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.ink2,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  statusDivider: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.ink4,
  },
  statusTimer: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.ink3,
    fontVariant: ['tabular-nums'],
  },
  transcriptWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  transcriptText: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    lineHeight: 42,
    letterSpacing: -0.6,
    fontWeight: '500',
    color: Colors.ink,
  },
  transcriptPlaceholder: {
    color: Colors.ink4,
  },
  errorText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.destructive,
    textAlign: 'center',
  },
  chipsRow: {
    minHeight: 36,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 22,
  },
  amountChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 0.5,
    borderColor: Colors.line,
    shadowColor: '#28241C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  amountChipText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.ink,
    fontVariant: ['tabular-nums'],
  },
  waveWrap: {
    paddingHorizontal: 24,
    marginBottom: 24,
    height: 56,
    justifyContent: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    marginBottom: 22,
  },
  sideBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 0.5,
    borderColor: 'rgba(40,36,28,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#28241C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  stopBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 26,
    elevation: 8,
    borderWidth: 8,
    borderColor: Colors.accentSoft,
  },
  stopSquare: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: Colors.white,
  },
  pressed: { opacity: 0.75 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 11.5,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
    color: Colors.ink3,
  },
  dotWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotHalo: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accentSoft,
  },
  dotCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  cursor: {
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: Colors.accent,
    marginLeft: 4,
  },
})
