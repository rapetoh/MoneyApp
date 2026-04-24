import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'
import { parseExpense } from '@voice-expense/ai'
import { supabase } from '../lib/supabase'
import { getApiUrl } from './useApiUrl'
import type { ParsedExpense } from '@voice-expense/shared'

export type VoiceState = 'idle' | 'listening' | 'processing' | 'done' | 'error'

export interface UseVoiceReturn {
  state: VoiceState
  transcript: string
  interimTranscript: string
  parsedExpense: ParsedExpense | null
  errorMessage: string | null
  startListening: (locale: string) => Promise<void>
  stopListening: () => void
  reset: () => void
  injectParsed: (parsed: ParsedExpense) => void
}

export function useVoice(
  userCurrency: string,
  userCategories: string[],
  userLocale: string,
): UseVoiceReturn {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [parsedExpense, setParsedExpense] = useState<ParsedExpense | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const finalTranscriptRef = useRef('')
  const lastInterimRef = useRef('')

  // Use refs so the speech-end callback always reads the latest values
  const categoriesRef = useRef(userCategories)
  const currencyRef = useRef(userCurrency)
  const localeRef = useRef(userLocale)
  useEffect(() => { categoriesRef.current = userCategories }, [userCategories])
  useEffect(() => { currencyRef.current = userCurrency }, [userCurrency])
  useEffect(() => { localeRef.current = userLocale }, [userLocale])

  // Interim results (shown in real-time while speaking)
  useSpeechRecognitionEvent('result', (event) => {
    const results = event.results
    if (!results?.length) return

    const best = results[0] as any
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

  useSpeechRecognitionEvent('end', () => {
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
    // 'no-speech' on real devices = user opened the mic and didn't say
    // anything. Still worth surfacing so the user knows why nothing
    // happened; we classify it alongside the silent-end case above.
    if (event.error === 'no-speech') {
      setErrorMessage('no-transcript')
      setState('error')
      return
    }
    setErrorMessage(`Speech recognition error: ${event.error}`)
    setState('error')
  })

  const runParse = useCallback(
    async (text: string) => {
      setState('processing')
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token ?? ''

        const apiBaseUrl = await getApiUrl()
        const result = await parseExpense({
          transcript: text,
          locale: localeRef.current as any,
          currency: currencyRef.current,
          categories: categoriesRef.current,
          apiBaseUrl,
          authToken: token,
        })

        setParsedExpense(result)
        setState('done')
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Parsing failed')
        setState('error')
      }
    },
    [],
  )

  const startListening = useCallback(async (locale: string) => {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!granted) {
      setErrorMessage('Microphone permission denied')
      setState('error')
      return
    }

    finalTranscriptRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setParsedExpense(null)
    setErrorMessage(null)
    setState('listening')

    ExpoSpeechRecognitionModule.start({
      lang: locale,
      continuous: false,
      interimResults: true,
      maxAlternatives: 1,
    })
  }, [])

  const stopListening = useCallback(() => {
    ExpoSpeechRecognitionModule.stop()
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setTranscript('')
    setInterimTranscript('')
    setParsedExpense(null)
    setErrorMessage(null)
    finalTranscriptRef.current = ''
  }, [])

  /**
   * Inject a parsed result directly (used by scan flow to reuse VoiceConfirmModal).
   * Sets state to 'done' so the modal opens automatically.
   */
  const injectParsed = useCallback((parsed: ParsedExpense) => {
    setParsedExpense(parsed)
    setTranscript('')
    setInterimTranscript('')
    setErrorMessage(null)
    setState('done')
  }, [])

  return {
    state,
    transcript,
    interimTranscript,
    parsedExpense,
    errorMessage,
    startListening,
    stopListening,
    reset,
    injectParsed,
  }
}
