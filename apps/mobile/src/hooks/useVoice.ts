import { useState, useCallback, useRef, useEffect } from 'react'
import { Animated } from 'react-native'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'
import { parseExpense } from '@voice-expense/ai'
import { supabase } from '../lib/supabase'
import { getApiUrl } from './useApiUrl'
import { localDay } from '@voice-expense/shared'
import { haptic } from '../services/haptics'
import { track } from '../services/analytics'
import type { ParsedExpense } from '@voice-expense/shared'

export type VoiceState = 'idle' | 'listening' | 'processing' | 'done' | 'error'

/**
 * How long the recogniser keeps listening in silence (owner report, Sep 19
 * 2026: "the time I'm allowed to think before talking is too short").
 * iOS ends its own task after about two seconds of silence, which cut
 * people off while they were still deciding what to say, so capture runs
 * in continuous mode and these two timers decide when to stop:
 *   - BEFORE a word is heard, the user is thinking: give them time.
 *   - AFTER the last word, a short pause means they have finished.
 */
const SILENCE_BEFORE_SPEECH_MS = 9000
const SILENCE_AFTER_SPEECH_MS = 2600

export interface UseVoiceReturn {
  state: VoiceState
  transcript: string
  interimTranscript: string
  parsedExpense: ParsedExpense | null
  errorMessage: string | null
  /** Mic input level, 0..1, updated ~every 80ms while listening. An
   *  Animated.Value (not React state) on purpose: the capture overlay's
   *  waveform consumes it via listener without re-rendering the provider
   *  tree at metering frequency. */
  volumeLevel: Animated.Value
  /** Wall-clock ms the last parse took (stop → parsed). Null until a
   *  parse completes; display-only ("1.8s" badge on the result sheet). */
  parseDurationMs: number | null
  startListening: (locale: string) => Promise<void>
  stopListening: () => void
  reset: () => void
  injectParsed: (parsed: ParsedExpense) => void
  /** Bumps on every startListening / injectParsed / reset — identifies
   *  one capture session. Key the result sheet on it so a new parse (e.g.
   *  a second Shortcut arriving while the sheet is already up) mounts a
   *  fresh sheet instead of reusing the previous one's internal state. */
  sessionGeneration: number
}

export function useVoice(
  userCurrency: string,
  userCategories: string[],
  userLocale: string,
  /** IANA zone (profiles.timezone) — anchors the parse prompt's "today"
   *  to the user's civil date instead of the server's UTC clock. */
  userTimezone: string = 'UTC',
): UseVoiceReturn {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [parsedExpense, setParsedExpense] = useState<ParsedExpense | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [parseDurationMs, setParseDurationMs] = useState<number | null>(null)
  const finalTranscriptRef = useRef('')
  const lastInterimRef = useRef('')
  const volumeLevel = useRef(new Animated.Value(0)).current
  const parseStartRef = useRef(0)
  // Session generation — bumped by every startListening / injectParsed /
  // reset. An async parse only writes its result if its generation is
  // still current, so a scan/Shortcut/notification inject arriving while
  // an older voice parse is in flight can never be overwritten by it.
  const sessionGenRef = useRef(0)
  // True between start() and the recognizer's own end/error events.
  const recognizerActiveRef = useRef(false)
  // Set when an inject aborts an in-progress recognition — tells the
  // end/error handlers to swallow that session instead of parsing it.
  const discardRecognitionRef = useRef(false)
  // Silence watchdog (see the constants above).
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heardSomethingRef = useRef(false)

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  /** (Re)start the watchdog; called on start and on every word heard. */
  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer()
    silenceTimerRef.current = setTimeout(
      () => {
        silenceTimerRef.current = null
        if (recognizerActiveRef.current) ExpoSpeechRecognitionModule.stop()
      },
      heardSomethingRef.current ? SILENCE_AFTER_SPEECH_MS : SILENCE_BEFORE_SPEECH_MS,
    )
  }, [clearSilenceTimer])

  useEffect(() => clearSilenceTimer, [clearSilenceTimer])

  // Use refs so the speech-end callback always reads the latest values
  const categoriesRef = useRef(userCategories)
  const currencyRef = useRef(userCurrency)
  const localeRef = useRef(userLocale)
  const timezoneRef = useRef(userTimezone)
  useEffect(() => { categoriesRef.current = userCategories }, [userCategories])
  useEffect(() => { currencyRef.current = userCurrency }, [userCurrency])
  useEffect(() => { localeRef.current = userLocale }, [userLocale])
  useEffect(() => { timezoneRef.current = userTimezone }, [userTimezone])

  // Interim results (shown in real-time while speaking)
  useSpeechRecognitionEvent('result', (event) => {
    const results = event.results
    if (!results?.length) return

    const best = results[0] as any
    if (best.transcript) {
      heardSomethingRef.current = true
      armSilenceTimer()
    }
    if (best.isFinal) {
      finalTranscriptRef.current = best.transcript
      lastInterimRef.current = ''
      setTranscript(best.transcript)
      setInterimTranscript('')
    } else {
      lastInterimRef.current = best.transcript
      setInterimTranscript(best.transcript)
    }
  })

  // Mic level for the live waveform. The module reports floats in −2..10
  // where anything below 0 is inaudible; normalize to 0..1.
  useSpeechRecognitionEvent('volumechange', (event) => {
    volumeLevel.setValue(Math.min(Math.max(event.value / 10, 0), 1))
  })

  useSpeechRecognitionEvent('end', () => {
    volumeLevel.setValue(0)
    recognizerActiveRef.current = false
    clearSilenceTimer()
    if (discardRecognitionRef.current) {
      discardRecognitionRef.current = false
      return
    }
    // iOS sometimes fires 'end' without ever setting isFinal=true.
    // Fall back to the last interim transcript so nothing is lost.
    const final = finalTranscriptRef.current || lastInterimRef.current
    if (final) {
      finalTranscriptRef.current = final
      setTranscript(final)
      setInterimTranscript('')
      runParse(final)
      return
    }
    // No transcript — either the user never spoke (common on real devices
    // when the mic button is tapped accidentally) OR the simulator mic
    // pipeline silently failed (AudioToolbox "Abandoning I/O cycle" in
    // logs). Either way, surface a visible hint instead of snapping back
    // to idle, which used to look like "the mic flickered and nothing
    // happened."
    setErrorMessage('no-transcript')
    setState('error')
  })

  useSpeechRecognitionEvent('error', (event) => {
    recognizerActiveRef.current = false
    clearSilenceTimer()
    if (discardRecognitionRef.current) {
      // Deliberately aborted by an inject — not an error the user sees.
      // The matching 'end' event clears the flag.
      return
    }
    // 'no-speech' on real devices = user opened the mic and didn't say
    // anything. Still worth surfacing so the user knows why nothing
    // happened; we classify it alongside the silent-end case above.
    if (event.error === 'no-speech') {
      setErrorMessage('no-transcript')
      setState('error')
      return
    }
    // Stable codes, never raw recognizer text: the overlay maps each to
    // localized copy (first-run audit C2). 'not-allowed' means the user
    // turned Microphone or Speech Recognition off in iOS Settings.
    setErrorMessage(event.error === 'not-allowed' ? 'mic-denied' : 'recognizer-error')
    setState('error')
  })

  const runParse = useCallback(
    async (text: string) => {
      const gen = sessionGenRef.current
      setState('processing')
      parseStartRef.current = Date.now()
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token ?? ''
        const userId = sessionData?.session?.user?.id

        const apiBaseUrl = await getApiUrl()
        const result = await parseExpense({
          transcript: text,
          locale: localeRef.current as any,
          currency: currencyRef.current,
          categories: categoriesRef.current,
          apiBaseUrl,
          authToken: token,
          userId,
          todayCivilDate: localDay(new Date().toISOString(), timezoneRef.current),
        })

        // A newer session (inject / reset / fresh recording) superseded
        // this parse while it was in flight — drop it.
        if (gen !== sessionGenRef.current) return
        setParseDurationMs(Date.now() - parseStartRef.current)
        setParsedExpense(result)
        setState('done')
      } catch (err) {
        if (gen !== sessionGenRef.current) return
        console.warn('[voice] parse failed', err instanceof Error ? err.message : err)
        setErrorMessage('parse-failed')
        setState('error')
      }
    },
    [],
  )

  const startListening = useCallback(async (locale: string) => {
    // First-run audit C2: once the user declines Microphone or Speech
    // Recognition, iOS never shows the alert again and requesting returns
    // "denied" instantly. Ask only when the OS still can; otherwise report
    // the stable 'mic-denied' code so the overlay offers Open Settings and
    // typing instead of a retry that can never succeed.
    let perm = await ExpoSpeechRecognitionModule.getPermissionsAsync()
    if (!perm.granted && perm.canAskAgain !== false) {
      perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      track('mic_permission', { granted: perm.granted })
    }
    if (!perm.granted) {
      haptic.warning()
      setErrorMessage('mic-denied')
      setState('error')
      return
    }
    haptic.tap()

    sessionGenRef.current++
    discardRecognitionRef.current = false
    // BOTH transcript refs, always together (owner report Sep 19 2026):
    // clearing only the final one left the previous capture's interim
    // text behind, and the 'end' handler below falls back to it when a
    // recording produced nothing. A silent tap therefore re-parsed the
    // last utterance, hit the parse cache, and raised the result sheet
    // holding the previous expense, complete with the amount the user
    // had already corrected by hand. Saving it created a second, wrong
    // transaction.
    finalTranscriptRef.current = ''
    lastInterimRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setParsedExpense(null)
    setErrorMessage(null)
    setState('listening')

    recognizerActiveRef.current = true
    heardSomethingRef.current = false
    armSilenceTimer()
    ExpoSpeechRecognitionModule.start({
      lang: locale,
      // Continuous, so the recogniser does not hang up on its own after a
      // couple of seconds of silence; the watchdog above decides instead.
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
      // Privacy screen promise: audio is transcribed on the phone and
      // never sent over the network. The module only honours this when
      // the device supports on-device recognition for the locale;
      // otherwise it falls back to networked (Apple-server) recognition
      // rather than erroring — which the Privacy copy discloses.
      requiresOnDeviceRecognition: true,
      // Display telemetry only — drives the capture overlay's waveform.
      // No effect on recognition or parsing.
      volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
    })
  }, [])

  const stopListening = useCallback(() => {
    haptic.tap()
    clearSilenceTimer()
    ExpoSpeechRecognitionModule.stop()
  }, [])

  const reset = useCallback(() => {
    sessionGenRef.current++
    clearSilenceTimer()
    if (recognizerActiveRef.current) {
      discardRecognitionRef.current = true
      ExpoSpeechRecognitionModule.abort()
    }
    setState('idle')
    setTranscript('')
    setInterimTranscript('')
    setParsedExpense(null)
    setErrorMessage(null)
    setParseDurationMs(null)
    finalTranscriptRef.current = ''
    lastInterimRef.current = ''
    volumeLevel.setValue(0)
  }, [volumeLevel])

  /**
   * Inject a parsed result directly (scan flow, iOS Shortcut, Android
   * notification listener). Sets state to 'done' so VoiceSessionProvider
   * presents the shared result sheet.
   */
  const injectParsed = useCallback((parsed: ParsedExpense) => {
    clearSilenceTimer()
    // Supersede any in-flight session: bump the generation (stale parse
    // completions drop themselves) and abort an active recognizer so its
    // end-of-speech parse can't overwrite this injected result.
    sessionGenRef.current++
    if (recognizerActiveRef.current) {
      discardRecognitionRef.current = true
      ExpoSpeechRecognitionModule.abort()
    }
    setParsedExpense(parsed)
    finalTranscriptRef.current = ''
    lastInterimRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setErrorMessage(null)
    setParseDurationMs(null)
    setState('done')
  }, [])

  return {
    state,
    transcript,
    interimTranscript,
    parsedExpense,
    errorMessage,
    volumeLevel,
    parseDurationMs,
    startListening,
    stopListening,
    reset,
    injectParsed,
    // Read at render time — every path that changes it (start / inject /
    // reset) also sets state, so consumers always re-render past it.
    sessionGeneration: sessionGenRef.current,
  }
}
