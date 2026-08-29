// Apple Pay capture — the notification (Aug 17, 2026, owner request:
// "when it saves, it should show a notification, the premium way").
//
// Two writers, one notification, replaced in place:
//   1. native/ios/WalletCapture.swift posts, the instant the tap happens,
//      identifier `wallet-capture-<id>` — "Saved $2.11 · Merchant / Filing
//      it in Murmur…" (Murmur's icon, not the Shortcuts banner).
//   2. `notifySaved` here re-posts with the SAME identifier once the real
//      row exists — iOS swaps the content in place: category line, and
//      Undo / Edit actions. Tapping opens the transaction.
//
// Foreground rule: if the user is looking at Murmur when the save lands
// (deep-link path, or a drain on foreground), the undo toast is enough —
// no notification, and the native placeholder (if any) is dismissed.
import * as Notifications from 'expo-notifications'
import { AppState, Platform } from 'react-native'
import { router } from 'expo-router'
import { deleteTransactionAndEnqueue } from '../hooks/useTransactions'

export const WALLET_CAPTURE_CATEGORY = 'wallet-capture'
const ACTION_UNDO = 'undo'
const ACTION_EDIT = 'edit'

let categoryReady: Promise<void> | null = null

/** Idempotent; called before the first notification and at drain mount. */
export function ensureWalletCaptureCategory(labels: { undo: string; edit: string }): Promise<void> {
  if (!categoryReady) {
    categoryReady = Notifications.setNotificationCategoryAsync(WALLET_CAPTURE_CATEGORY, [
      {
        identifier: ACTION_UNDO,
        buttonTitle: labels.undo,
        options: { isDestructive: true, opensAppToForeground: false },
      },
      {
        identifier: ACTION_EDIT,
        buttonTitle: labels.edit,
        options: { opensAppToForeground: true },
      },
    ])
      .then(() => undefined)
      .catch(() => undefined)
  }
  return categoryReady
}

export async function getNotificationPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  const s = await Notifications.getPermissionsAsync()
  if (s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL)
    return 'granted'
  if (s.canAskAgain === false) return 'denied'
  return 'undetermined'
}

export async function requestNotificationPermission(): Promise<'granted' | 'denied'> {
  const s = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  })
  return s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ? 'granted'
    : 'denied'
}

export interface SavedCaptureNotice {
  captureId: string
  transactionId: string | null
  userId: string
  title: string // "Saved $2.11 · Three Square Market"
  body: string // "Food & Dining · Tap to edit"
}

/** Post (or replace) the saved-purchase notification. No-op while the app
 *  is in the foreground — the undo toast covers that case. */
export async function notifySaved(n: SavedCaptureNotice): Promise<void> {
  const identifier = `wallet-capture-${n.captureId}`
  if (AppState.currentState === 'active') {
    // Native placeholder may exist from the intent — remove it; the toast
    // is on screen.
    try {
      await Notifications.dismissNotificationAsync(identifier)
    } catch {
      /* noop */
    }
    return
  }
  try {
    // iOS is documented to replace a delivered notification when a new
    // request reuses its identifier, but on the owner's iPhone (build 33)
    // both the native placeholder and the final one stayed. Remove the
    // placeholder explicitly first — one banner, always.
    await Notifications.dismissNotificationAsync(identifier).catch(() => undefined)
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: n.title,
        body: n.body,
        sound: false,
        categoryIdentifier: WALLET_CAPTURE_CATEGORY,
        data: { transactionId: n.transactionId, userId: n.userId, kind: 'wallet-capture' },
        ...(Platform.OS === 'ios' ? { threadIdentifier: 'wallet-capture' } : {}),
      },
      trigger: null,
    })
  } catch {
    /* permission missing — the save itself already happened */
  }
}

export interface IncompleteCaptureNotice {
  captureId: string
  merchant: string
  capturedAt: string
  title: string // "Captured from Apple Pay"
  body: string // "Maverik - couldn't read the amount · Tap to add it"
}

/** Pay-at-pump case (Aug 24 2026): the automation delivered no amount.
 *  The capture is real but unsaveable — tell the user, and a tap opens
 *  Quick entry with the merchant pre-filled. Replaces the placeholder. */
export async function notifyIncomplete(n: IncompleteCaptureNotice): Promise<void> {
  const identifier = `wallet-capture-${n.captureId}`
  try {
    await Notifications.dismissNotificationAsync(identifier).catch(() => undefined)
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: n.title,
        body: n.body,
        sound: false,
        data: {
          kind: 'wallet-capture-incomplete',
          merchant: n.merchant,
          captureId: n.captureId,
          capturedAt: n.capturedAt,
        },
        ...(Platform.OS === 'ios' ? { threadIdentifier: 'wallet-capture' } : {}),
      },
      trigger: null,
    })
  } catch {
    /* permission missing */
  }
}

/** Response handling: Undo deletes the row (background action); Edit or a
 *  plain tap opens the transaction. Returns the unsubscribe. */
export function subscribeWalletCaptureResponses(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data as
      | { kind?: string; transactionId?: string | null; userId?: string }
      | undefined
    if (data?.kind === 'wallet-capture-incomplete') {
      const d = data as { merchant?: string; captureId?: string; capturedAt?: string }
      router.push({
        pathname: '/transaction/new',
        params: {
          ...(d.merchant ? { merchant: d.merchant } : {}),
          ...(d.captureId ? { captureId: d.captureId } : {}),
          ...(d.capturedAt ? { capturedAt: d.capturedAt } : {}),
        },
      })
      return
    }
    if (data?.kind !== 'wallet-capture') return
    if (response.actionIdentifier === ACTION_UNDO) {
      if (data.transactionId && data.userId) {
        try {
          await deleteTransactionAndEnqueue(data.userId, data.transactionId)
        } catch {
          /* noop */
        }
      }
      return
    }
    // Edit or default tap.
    if (data.transactionId) router.push(`/transaction/${data.transactionId}`)
  })
  return () => sub.remove()
}
