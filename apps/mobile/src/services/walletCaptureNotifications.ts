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
import { File, Paths } from 'expo-file-system'
import { deleteTransactionAndEnqueue } from '../hooks/useTransactions'
import { merchantLogoUrl } from './merchantLogo'

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
  /** For the logo thumbnail on the right of the banner. */
  merchant?: string | null
  merchantDomain?: string | null
}

/** How long a save waits for its logo before posting without one. The
 *  banner is the confirmation that the money was recorded; a picture is
 *  never worth delaying that by more than a beat. */
const LOGO_TIMEOUT_MS = 3000

/**
 * The merchant's logo as a notification attachment: the thumbnail iOS shows
 * on the right of the banner, the way messaging apps show a photo (owner
 * request, Oct 4 2026). Same image the transaction row shows in the app,
 * from the same `merchantLogoUrl`, so the banner and the list agree.
 *
 * iOS needs a local file and MOVES it into its own store when the
 * notification is added, so each banner gets its own uniquely named copy
 * in the cache directory. A merchant with no known logo (the favicon
 * service answers 404, which is also what makes the in-app row fall back to
 * its letter tile), a slow network or any error means no attachment, never
 * a missing banner and never a generic placeholder: the app icon is already
 * on the left.
 */
async function logoAttachment(
  merchant: string | null | undefined,
  merchantDomain: string | null | undefined,
): Promise<Notifications.NotificationContentAttachmentIos | null> {
  if (Platform.OS !== 'ios') return null
  const url = merchantLogoUrl(merchant, merchantDomain)
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOGO_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length < 64) return null
    const file = new File(Paths.cache, `notif-logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`)
    file.create()
    file.write(bytes)
    // expo-notifications' TypeScript type names the file `url`, but its iOS
    // side reads `uri` (Records.swift: `request["uri"]`) and nothing in
    // between maps one to the other. Sent as `url` only, iOS received an
    // empty path and silently dropped the image: build 70 shipped with no
    // logo on the owner's phone (Oct 4 2026). Both keys are sent so the type
    // stays satisfied and the native side gets what it actually reads.
    return {
      identifier: 'merchant-logo',
      url: file.uri,
      uri: file.uri,
      type: null,
      typeHint: 'public.png',
    } as Notifications.NotificationContentAttachmentIos
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
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
    const logo = await logoAttachment(n.merchant, n.merchantDomain)
    await Notifications.dismissNotificationAsync(identifier).catch(() => undefined)
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: n.title,
        body: n.body,
        sound: false,
        ...(logo ? { attachments: [logo] } : {}),
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
