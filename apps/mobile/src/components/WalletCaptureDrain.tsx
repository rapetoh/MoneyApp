// Apple Pay capture — the consumer (Aug 17, 2026). Mounted once in the
// root layout, inside UndoProvider. Renders nothing.
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
  stashIncompleteCapture,
  pendingIncompleteCaptures,
  type WalletCaptureEntry,
} from '../services/walletCapture'
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
  type Locale,
} from '@voice-expense/shared'

const CATEGORY_BUDGET_MS = 4000

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
          try {
            await saveOne(entry)
          } finally {
            // Release the waiting App Intent (no-op without the bridge).
            reportCaptureDone(entry.id)
          }
        }
      } finally {
        draining.current = false
      }
    }

    const saveOne = async (entry: WalletCaptureEntry) => {
      const { profile, categories, createTransaction, showUndo, userId } = ref.current
      if (!userId) return
      const currency = profile?.currency_code ?? 'USD'
      const locale = (profile?.locale ?? 'en') as Locale
      const tz = profile?.timezone || 'UTC'
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

    const renotifyIncomplete = async () => {
      const { profile } = ref.current
      const locale = (profile?.locale ?? 'en') as Locale
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
