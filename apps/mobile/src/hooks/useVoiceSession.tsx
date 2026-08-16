import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, BackHandler } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from './useAuth'
import { useProfile } from './useProfile'
import { useCategories } from './useCategories'
import { useTransactions, deleteTransactionAndEnqueue } from './useTransactions'
import { useVoice } from './useVoice'
import { useUndo } from './useUndo'
import { useNotificationListener } from './useNotificationListener'
import { VoiceCaptureOverlay } from '../components/VoiceCaptureOverlay'
import { VoiceResultSheet, type ConfirmedExpense } from '../components/VoiceResultSheet'
import { Presence } from '../components/Presence'
import { t, formatMoney } from '@voice-expense/shared'
import type { Locale, ParsedExpense, TransactionSource } from '@voice-expense/shared'

interface VoiceSessionApi {
  /** Start an in-place voice capture (14a) over whatever screen is showing.
   *  Wired to the tab-bar mic FAB — no navigation happens. */
  openVoice: () => void
  /** Present an already-parsed expense in the result sheet (14b) — the one
   *  entry point shared by scan, iOS Shortcut, and the Android
   *  payment-notification listener. */
  presentParsed: (parsed: ParsedExpense, source: TransactionSource) => void
}

const VoiceSessionContext = createContext<VoiceSessionApi | null>(null)

// App locale → BCP-47 tag for the platform speech recognizer, unless the
// profile pins an explicit voice_language.
const LOCALE_TO_BCP47: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  pt: 'pt-BR',
}

/**
 * Root-level owner of the voice capture loop (docs/voice redesign, artboards
 * 14a–14c + 15). Mounted once in app/_layout.tsx inside UndoProvider:
 *
 *   mic FAB → openVoice() → VoiceCaptureOverlay (in place, no navigation)
 *   → stop → parse → VoiceResultSheet (confirm / expand-to-edit)
 *   → save → undo snackbar (15)
 *
 * Every capture path funnels through the same sheet and the same save
 * handler, which is what lets the Android notification listener and the
 * iOS Shortcut keep working with one mount instead of the two competing
 * VoiceConfirmModal mounts this replaces.
 */
export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { categories, createCategory } = useCategories(user?.id)
  const { createTransaction } = useTransactions(user?.id)
  const { showUndo } = useUndo()
  const router = useRouter()

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const timezone = profile?.timezone || 'UTC'
  const speechLocale = profile?.voice_language ?? LOCALE_TO_BCP47[locale] ?? 'en-US'
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories])

  const voice = useVoice(currency, categoryNames, locale, timezone)
  const [source, setSource] = useState<TransactionSource>('voice')
  const [saving, setSaving] = useState(false)

  const openVoice = useCallback(() => {
    if (!user) return
    // Ignore taps while a capture or result is already in flight.
    if (voice.state !== 'idle') return
    setSource('voice')
    voice.startListening(speechLocale)
     
  }, [user, voice.state, voice.startListening, speechLocale])

  const presentParsed = useCallback(
    (parsed: ParsedExpense, src: TransactionSource) => {
      setSource(src)
      voice.injectParsed(parsed)
    },
     
    [voice.injectParsed],
  )

  // Android payment-notification capture (fix-plan 3.4) — root-level so a
  // detected payment reaches the sheet regardless of the screen on top.
  // This is the app's single subscribing call site (Settings mounts the
  // hook without a callback, for permission state only).
  useNotificationListener(
    useCallback((parsed: ParsedExpense) => presentParsed(parsed, 'notification_listener'), [presentParsed]),
  )

  const overlayVisible = voice.state === 'listening' || voice.state === 'processing' || voice.state === 'error'
  const sheetVisible = voice.state === 'done' && voice.parsedExpense !== null

  const dismissAll = useCallback(() => {
    voice.reset()
    setSource('voice')
     
  }, [voice.reset])

  // Hardware back closes the capture surface instead of popping navigation —
  // the overlay and sheet are plain layers, not Modals, so without this the
  // system back would navigate underneath them.
  useEffect(() => {
    if (!overlayVisible && !sheetVisible) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissAll()
      return true
    })
    return () => sub.remove()
  }, [overlayVisible, sheetVisible, dismissAll])

  async function handleSave(expense: ConfirmedExpense) {
    setSaving(true)
    const parsed = voice.parsedExpense
    const result = await createTransaction({
      amount: expense.amount,
      direction: expense.direction,
      currency_code: expense.currency,
      merchant: expense.merchant,
      note: expense.note,
      category_id: expense.categoryId,
      merchant_domain: parsed?.merchant_domain ?? null,
      // null is the honest answer when neither the AI nor the user named a
      // payment method (see the old confirm modal's rationale — a 'cash'
      // fallback mislabelled every card receipt).
      payment_method: expense.paymentMethod,
      // AI-parsed date (fix-plan 2.8); undefined lets createTransaction
      // apply its own `now` default instead of writing a literal null.
      transacted_at: expense.transactedAt ?? undefined,
      source,
      raw_transcript: voice.transcript || null,
      ai_confidence: parsed?.confidence ?? null,
      is_recurring: expense.isRecurring,
      // The rule itself is created server-side by the transactions trigger
      // (migration 013) once this row syncs.
      recurring_frequency: expense.isRecurring ? expense.recurringFrequency : null,
    })
    setSaving(false)

    if (result.error && result.status === 'rejected') {
      // The row was already written locally (offline-first) — the sheet
      // must close anyway, or a second Save writes a duplicate row (this
      // exact trap produced the twin $6.00 rows in TestFlight build 8).
      // The sync-failure banner owns retry/discard for the rejected write.
      Alert.alert(t('common.error', locale), result.error)
      dismissAll()
      return
    }

    const savedId = result.id
    const label = expense.merchant?.trim()
      || categories.find((c) => c.id === expense.categoryId)?.name
      || t(expense.direction === 'credit' ? 'voice.income_label' : 'voice.expense', locale)
    showUndo({
      message: `${t('voice.saved', locale)} · ${label} ${formatMoney(expense.amount, expense.currency, locale)}`,
      undoLabel: t('common.undo', locale),
      undo: async () => {
        if (savedId && user?.id) await deleteTransactionAndEnqueue(user.id, savedId)
      },
    })

    dismissAll()
  }

  const handleRedo = useCallback(() => {
    voice.reset()
    setSource('voice')
    voice.startListening(speechLocale)
     
  }, [voice.reset, voice.startListening, speechLocale])

  const handleKeyboard = useCallback(() => {
    dismissAll()
    router.push('/transaction/new')
  }, [dismissAll, router])

  const parsed = voice.parsedExpense

  const api = useMemo<VoiceSessionApi>(() => ({ openVoice, presentParsed }), [openVoice, presentParsed])

  // Both layers sit inside <Presence> so they glide in over the current
  // screen and glide out on cancel / save — and stay mounted (frozen on
  // their last props) through the exit, instead of vanishing on the frame
  // `voice.reset()` clears the state. The overlay's exit and the sheet's
  // entrance overlap when a parse lands, which is the cross-fade from
  // "listening" to "here's what I heard".
  return (
    <VoiceSessionContext.Provider value={api}>
      {children}
      <Presence visible={overlayVisible}>
        {overlayVisible ? (
          <VoiceCaptureOverlay
            phase={voice.state === 'listening' ? 'listening' : voice.state === 'processing' ? 'processing' : 'error'}
            transcript={voice.interimTranscript || voice.transcript}
            errorMessage={voice.errorMessage}
            volumeLevel={voice.volumeLevel}
            currencyCode={currency}
            locale={locale}
            onCancel={dismissAll}
            onStop={voice.stopListening}
            onKeyboard={handleKeyboard}
            onRetry={() => voice.startListening(speechLocale)}
          />
        ) : null}
      </Presence>
      <Presence visible={sheetVisible && parsed !== null}>
        {sheetVisible && parsed ? (
          <VoiceResultSheet
            // The sheet seeds its editable fields from `parsed` once, on
            // mount. A new parse while it is up (a second Shortcut, an
            // Android notification landing on an open sheet) must be a
            // new sheet, not the old instance showing the old amount.
            key={voice.sessionGeneration}
            parsed={parsed}
            transcript={voice.transcript}
            parseDurationMs={voice.parseDurationMs}
            categories={categories}
            onCreateCategory={createCategory}
            onSave={handleSave}
            onDismiss={dismissAll}
            onRedo={source === 'voice' ? handleRedo : undefined}
            saving={saving}
            locale={locale}
            timezone={timezone}
          />
        ) : null}
      </Presence>
    </VoiceSessionContext.Provider>
  )
}

export function useVoiceSession(): VoiceSessionApi {
  const ctx = useContext(VoiceSessionContext)
  if (!ctx) {
    throw new Error('useVoiceSession must be called inside <VoiceSessionProvider>')
  }
  return ctx
}
