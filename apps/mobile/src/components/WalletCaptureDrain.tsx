// Captures that arrive without the app on screen — the consumer
// (Aug 17, 2026). Mounted once in the root layout, inside UndoProvider.
// Renders nothing.
//
// Two producers, one queue (services/walletCapture.ts):
//   'wallet' — an Apple Pay tap or the old deep link. Amount and merchant
//              come from the card network, so there is nothing to parse.
//   'phrase' — Siri heard a sentence (native/ios/SiriLogExpense.swift).
//              It goes through `parseExpense`, the same parser the
//              microphone uses, and the answer travels back to Siri so it
//              can say the amount and merchant it actually filed
//              (Sep 20, 2026).
//
// Drains the capture queue (services/walletCapture.ts) on mount, whenever
// the app returns to the foreground, and on a poke from the deep-link
// route, and saves every entry silently through `createTransaction` —
// no confirm sheet (owner decision: the amount and merchant come from the
// card network; nothing to confirm). Category is a best-effort AI guess
// with a hard 2.5 s budget; on timeout or error the row saves
// uncategorised and the user can fix it from the list. Each save shows
// the same "Saved · Merchant $x" undo toast a voice entry shows.
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useCategories } from '../hooks/useCategories'
import { useTransactions, deleteTransactionAndEnqueue } from '../hooks/useTransactions'
import { useUndo } from '../hooks/useUndo'
import { getApiUrl } from '../hooks/useApiUrl'
import { supabase } from '../lib/supabase'
import {
  takeQueuedCaptures,
  takePendingInMemory,
  onWalletCapturePoke,
  normaliseCapture,
  normaliseSpoken,
  stashIncompleteCapture,
  pendingIncompleteCaptures,
  type WalletCaptureEntry,
} from '../services/walletCapture'
import { rememberCapturePrefs, readCapturePrefs } from '../services/capturePrefs'
import {
  ensureWalletCaptureCategory,
  notifySaved,
  notifyIncomplete,
  subscribeWalletCaptureResponses,
} from '../services/walletCaptureNotifications'
import { addCaptureAppendedListener, reportCaptureDone } from '../../modules/wallet-capture/src'
import { parseExpense, deriveDirectionFromFlowType } from '@voice-expense/ai'
import {
  t,
  formatMoney,
  localDay,
  resolveCategorySuggestion,
  guessCategoryFromMerchant,
  brandDomainForMerchant,
  type Category,
  type Locale,
} from '@voice-expense/shared'

const CATEGORY_BUDGET_MS = 4000
/** How long a Siri entry may wait on the parser. The intent gives the
 *  whole round trip 9 s (SiriLogExpense.swift), and a cold JavaScript
 *  start eats the rest. */
const SIRI_PARSE_BUDGET_MS = 6000
/** Past this, Siri has already spoken its fallback line, so the save also
 *  posts a notification: without it a late finish would be silent. Must
 *  match the intent's own timeout. */
const SIRI_ANSWER_DEADLINE_MS = 9000

export function WalletCaptureDrain() {
  const { user } = useAuth()
  const userId = user?.id
  const { profile } = useProfile(userId)
  const { categories } = useCategories(userId)
  const { createTransaction } = useTransactions(userId)
  const { showUndo } = useUndo()

  // Latest values for the async drain without re-subscribing.
  const ref = useRef({ userId, profile, categories, createTransaction, showUndo })
  ref.current = { userId, profile, categories, createTransaction, showUndo }

  // Keep the on-disk copy of the three fields a background capture needs
  // in step with the profile. Siri and Apple Pay run with the app cold,
  // where the in-memory profile cache is empty and the network may not
  // have answered yet.
  useEffect(() => {
    if (!profile?.currency_code || categories.length === 0) return
    rememberCapturePrefs({
      currency: profile.currency_code,
      locale: (profile.locale ?? 'en') as Locale,
      timezone: profile.timezone || 'UTC',
      categories,
    })
  }, [profile?.currency_code, profile?.locale, profile?.timezone, categories])
  const draining = useRef(false)
  const seen = useRef(new Set<string>())

  useEffect(() => {
    if (!userId) return

    const drain = async () => {
      if (draining.current) return
      draining.current = true
      try {
        const entries = [...takeQueuedCaptures(), ...takePendingInMemory()]
        for (const entry of entries) {
          if (seen.current.has(entry.id)) continue
          seen.current.add(entry.id)
          let dialog: string | null = null
          try {
            if (entry.kind === 'phrase') dialog = await saveSpoken(entry)
            else await saveOne(entry)
          } finally {
            // Release the waiting App Intent (no-op without the bridge).
            // Siri speaks `dialog`; a Wallet capture passes nothing and
            // confirms with its notification instead.
            reportCaptureDone(entry.id, dialog)
          }
        }
      } finally {
        draining.current = false
      }
    }

    /**
     * Currency, language and timezone for a capture, from the profile
     * when it is loaded and from disk when it is not. A capture arrives
     * precisely when the app was not running, so "not loaded" is the
     * normal case, not the edge case.
     */
    const prefs = (): {
      currency: string
      locale: Locale
      tz: string
      categories: Category[]
    } => {
      const { profile, categories } = ref.current
      // One read, whenever either half is missing: both are fetched and
      // both are empty on a background launch.
      const stored = profile?.currency_code && categories.length > 0 ? null : readCapturePrefs()
      return {
        currency: profile?.currency_code || stored?.currency || 'USD',
        locale: ((profile?.locale || stored?.locale) ?? 'en') as Locale,
        tz: profile?.timezone || stored?.timezone || 'UTC',
        categories: categories.length > 0 ? categories : (stored?.categories ?? []),
      }
    }

    const saveOne = async (entry: WalletCaptureEntry) => {
      const { createTransaction, showUndo, userId } = ref.current
      if (!userId) return
      const { currency, locale, tz, categories } = prefs()
      const n = normaliseCapture(entry, currency)
      if (!n) {
        // Missing amount (pay-at-pump pre-auth, Aug 24 2026): park it until
        // resolved — a notification alone can be swiped away and the
        // purchase would be lost. `renotifyIncomplete` below re-surfaces it
        // every launch/foreground until the user saves the pre-filled
        // entry. A *negative* amount is a refund: deliberately unlogged.
        if (entry.amount.trim() === '' && entry.merchant.trim()) {
          stashIncompleteCapture(entry)
        }
        return
      }

      // Category: instant local guess from the merchant string (canteen /
      // vending / Shell / Uber …), then the AI parser as refinement within
      // a hard budget — a Wallet capture must never wait on the network.
      let categoryId: string | null =
        guessCategoryFromMerchant(n.merchant, categories)?.category.id ?? null
      // Brand domain (logo) from the local table first — instant, no
      // network; the AI refinement below may override with something
      // more specific (owner remark Aug 24: Target showed a letter tile).
      let merchantDomain: string | null = brandDomainForMerchant(n.merchant)
      if (n.merchant) {
        try {
          const { data } = await supabase.auth.getSession()
          const token = data?.session?.access_token ?? ''
          const apiBaseUrl = await getApiUrl()
          const parsed = await Promise.race([
            parseExpense({
              transcript: `${n.amount} ${n.currency} at ${n.merchant}`,
              locale: locale as never,
              currency: n.currency,
              categories: categories.map((c) => c.name),
              apiBaseUrl,
              authToken: token,
              userId,
              todayCivilDate: localDay(new Date().toISOString(), tz),
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), CATEGORY_BUDGET_MS)),
          ])
          if (parsed) {
            const refined =
              resolveCategorySuggestion(parsed.category_suggestion, categories)?.category.id ?? null
            if (refined) categoryId = refined
            merchantDomain = parsed.merchant_domain ?? merchantDomain
          }
        } catch {
          /* uncategorised is fine */
        }
      }

      const result = await createTransaction({
        amount: n.amount,
        direction: deriveDirectionFromFlowType('expense'),
        currency_code: n.currency,
        merchant: n.merchant,
        note: null,
        category_id: categoryId,
        merchant_domain: merchantDomain,
        payment_method: 'digital_wallet',
        transacted_at: n.capturedAt,
        source: 'shortcut',
        ai_confidence: null,
        is_recurring: false,
      })
      if (result.error && result.status === 'rejected') return

      const savedId = result.id
      const label = n.merchant ?? t('voice.expense', locale)
      const money = formatMoney(n.amount, n.currency, locale)
      showUndo({
        message: `${t('voice.saved', locale)} · ${label} ${money}`,
        undoLabel: t('common.undo', locale),
        undo: async () => {
          if (savedId) await deleteTransactionAndEnqueue(userId, savedId)
        },
      })
      // The premium confirmation: Murmur's own notification (replaces the
      // native placeholder posted at tap time), with the category and
      // Undo / Edit actions. Skipped when the app is in the foreground.
      const categoryName = categoryId
        ? (categories.find((c) => c.id === categoryId)?.name ?? null)
        : null
      await ensureWalletCaptureCategory({
        undo: t('common.undo', locale),
        edit: t('common.edit', locale),
      })
      await notifySaved({
        captureId: entry.id,
        transactionId: savedId ?? null,
        userId,
        // Mockup copy (docs/money-app/project): "Captured from Apple Pay"
        // / "Merchant · Category · just now".
        title: `${t('applepay.notif_captured', locale)} · ${money}`,
        body: `${label} · ${categoryName ?? t('applepay.uncategorised', locale)} · ${t('applepay.tap_to_edit', locale)}`,
      })
    }

    /**
     * A sentence Siri heard, turned into a row and into the line Siri
     * says back. Returns that line, or null when there is nothing worth
     * saying (no signed-in user).
     *
     * Everything the microphone does, this does: the same parser, the
     * same category resolution, the same offline-first write, the same
     * undo toast. What it never does is guess. A sentence with no amount
     * is not saved as a phantom row; Siri says so and the user repeats
     * it, which costs four seconds and no cleanup.
     */
    const saveSpoken = async (entry: WalletCaptureEntry): Promise<string | null> => {
      const { createTransaction, showUndo, userId } = ref.current
      if (!userId) return null
      const { currency: profileCurrency, locale, tz, categories } = prefs()

      let parsed: Awaited<ReturnType<typeof parseExpense>> | null = null
      try {
        const { data } = await supabase.auth.getSession()
        const token = data?.session?.access_token ?? ''
        const apiBaseUrl = await getApiUrl()
        parsed = await Promise.race([
          parseExpense({
            transcript: entry.phrase,
            locale: locale as never,
            currency: profileCurrency,
            categories: categories.map((c) => c.name),
            apiBaseUrl,
            authToken: token,
            userId,
            todayCivilDate: localDay(new Date().toISOString(), tz),
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), SIRI_PARSE_BUDGET_MS)),
        ])
      } catch {
        // Offline, a rejected parse, an expired session: fall through to
        // the local reading below rather than losing the entry.
        parsed = null
      }

      // Without a parser (offline, or slower than Siri's budget) the
      // amount is read out of the words themselves: a bare amount with the
      // sentence kept as the transcript beats losing the entry.
      const n = normaliseSpoken(entry, parsed, profileCurrency)
      if (!n) return t('siri.no_amount', locale)
      const { amount, currency, merchant } = n
      const categoryId = parsed
        ? (resolveCategorySuggestion(parsed.category_suggestion, categories)?.category.id ?? null)
        : (guessCategoryFromMerchant(merchant, categories)?.category.id ?? null)
      const merchantDomain = parsed?.merchant_domain ?? brandDomainForMerchant(merchant)

      const result = await createTransaction({
        amount,
        // The parser classifies intent and code derives the sign, so
        // "I got paid 200" through Siri lands as income, exactly as it
        // would through the microphone. Without a parse it is a debit.
        direction: parsed?.direction ?? deriveDirectionFromFlowType('expense'),
        currency_code: currency,
        merchant,
        note: parsed?.note ?? null,
        category_id: categoryId,
        merchant_domain: merchantDomain,
        payment_method: parsed?.payment_method ?? null,
        transacted_at: n.transactedAt,
        // It was spoken, so it is a voice entry: it reads that way in the
        // transaction detail and counts that way in insights.
        source: 'voice',
        raw_transcript: entry.phrase,
        ai_confidence: parsed?.confidence ?? null,
        // Never from Siri: a recurring rule the user did not confirm
        // writes months of future rows on one unheard sentence.
        is_recurring: false,
      })
      if (result.error && result.status === 'rejected') return t('siri.failed', locale)

      const savedId = result.id
      const money = formatMoney(amount, currency, locale)
      const categoryName = categoryId
        ? (categories.find((c) => c.id === categoryId)?.name ?? null)
        : null
      const label = merchant ?? categoryName ?? t('voice.expense', locale)
      showUndo({
        message: `${t('voice.saved', locale)} · ${label} ${money}`,
        undoLabel: t('common.undo', locale),
        undo: async () => {
          if (savedId) await deleteTransactionAndEnqueue(userId, savedId)
        },
      })

      // Siri has already answered by now if we took too long, so leave a
      // notification behind; `notifySaved` is a no-op while the app is on
      // screen, where the toast above is the confirmation.
      if (Date.now() - Date.parse(entry.captured_at) > SIRI_ANSWER_DEADLINE_MS) {
        await ensureWalletCaptureCategory({
          undo: t('common.undo', locale),
          edit: t('common.edit', locale),
        })
        await notifySaved({
          captureId: entry.id,
          transactionId: savedId ?? null,
          userId,
          title: `${t('siri.notif_title', locale)} · ${money}`,
          body: `${label} · ${categoryName ?? t('applepay.uncategorised', locale)} · ${t('applepay.tap_to_edit', locale)}`,
        })
      }

      return merchant
        ? t('siri.saved', locale).replace('{money}', money).replace('{merchant}', merchant)
        : t('siri.saved_plain', locale).replace('{money}', money)
    }

    const renotifyIncomplete = async () => {
      const { locale } = prefs()
      for (const entry of pendingIncompleteCaptures()) {
        const merchant = entry.merchant.trim()
        await notifyIncomplete({
          captureId: entry.id,
          merchant,
          capturedAt: entry.captured_at,
          title: t('applepay.notif_captured', locale),
          body: `${merchant} · ${t('applepay.amount_unknown', locale)}`,
        })
      }
    }

    // Notification actions (Undo / Edit / tap) for the lifetime of the drain.
    const offResponses = subscribeWalletCaptureResponses()
    // Launch / user change.
    void drain().then(renotifyIncomplete)
    // Foreground.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void drain().then(renotifyIncomplete)
    })
    // Deep-link route poke.
    const off = onWalletCapturePoke(() => void drain())
    // Native App Intent poke (app suspended in memory or launched in the
    // background for the intent) — the reason the save happens at tap time.
    const native = addCaptureAppendedListener(() => void drain())
    return () => {
      sub.remove()
      off()
      offResponses()
      native.remove()
    }
  }, [userId])

  return null
}
