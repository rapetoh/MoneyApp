// Apple Pay capture — JavaScript half (Aug 17, 2026).
//
// Two producers write "capture" entries:
//   1. native/ios/WalletCapture.swift — the "Log Expense in Murmur" App
//      Intent, run in the background by a Wallet automation. It appends
//      one JSON line to Documents/wallet-capture-queue.jsonl.
//   2. app/shortcut.tsx — the older `voiceexpense://shortcut?amount=…` deep
//      link (kept for already-installed shortcuts). It enqueues the same
//      shape via `enqueueWalletCapture` and pokes the drain.
//
// One consumer, `WalletCaptureDrain` (components/WalletCaptureDrain.tsx,
// mounted in the root layout inside the Undo provider): on launch, on
// foreground, and on a poke, it reads and clears the queue and saves each
// entry through `createTransaction` — the same offline-first path a
// confirmed voice entry uses (FX snapshot, sync outbox, realtime) — with
// `source: 'shortcut'`, `payment_method: 'digital_wallet'`, and a
// best-effort category from the AI parser (never blocking on it). No
// confirm sheet: the amount and merchant come from the card network, so
// there is nothing to confirm (owner decision Aug 17 2026, matching
// MonAi). The undo toast is the safety net.
import { File, Paths } from 'expo-file-system'
import { parseShortcutAmount, inferShortcutCurrency } from './shortcutLink'

export const WALLET_QUEUE_FILE = 'wallet-capture-queue.jsonl'

export interface WalletCaptureEntry {
  id: string
  /** Formatted or bare amount as Wallet handed it over — "$2.11", "2,11 €". */
  amount: string
  merchant: string
  /** ISO code or '' — inferred from the amount's symbol / profile when empty. */
  currency: string
  source: 'shortcut'
  captured_at: string
}

function queueFile(): File {
  return new File(Paths.document, WALLET_QUEUE_FILE)
}

/** Read every pending entry and clear the file atomically enough for our
 *  purposes (read → delete → return). A save that then fails is
 *  re-queued by the caller. */
export function takeQueuedCaptures(): WalletCaptureEntry[] {
  const f = queueFile()
  if (!f.exists) return []
  let raw = ''
  try {
    raw = f.textSync()
  } catch {
    return []
  }
  try {
    f.delete()
  } catch {
    /* if delete fails we still process; duplicates are guarded by id below */
  }
  const out: WalletCaptureEntry[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const e = JSON.parse(t) as Partial<WalletCaptureEntry>
      if (typeof e.amount === 'string' && typeof e.id === 'string') {
        out.push({
          id: e.id,
          amount: e.amount,
          merchant: typeof e.merchant === 'string' ? e.merchant : '',
          currency: typeof e.currency === 'string' ? e.currency : '',
          source: 'shortcut',
          captured_at: typeof e.captured_at === 'string' ? e.captured_at : new Date().toISOString(),
        })
      }
    } catch {
      /* skip a corrupt line */
    }
  }
  return out
}

/** Append an entry (JS producer — the deep-link route) and poke the drain. */
export function enqueueWalletCapture(
  entry: Omit<WalletCaptureEntry, 'id' | 'source' | 'captured_at'>,
): void {
  const full: WalletCaptureEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    source: 'shortcut',
    captured_at: new Date().toISOString(),
    ...entry,
  }
  const f = queueFile()
  const line = JSON.stringify(full) + '\n'
  try {
    if (f.exists) f.write(f.textSync() + line)
    else f.write(line)
  } catch {
    // Fall back to an in-memory poke with the entry so it is not lost.
    pending.push(full)
  }
  poke()
}

/** Entries that could not be written to disk — drained together with the file. */
const pending: WalletCaptureEntry[] = []
export function takePendingInMemory(): WalletCaptureEntry[] {
  return pending.splice(0, pending.length)
}

// ── Incomplete captures (no amount — pay-at-pump pre-auths) ─────────────────
//
// Aug 24, 2026 owner review: a notification alone was the only trace of an
// amount-less capture — swiping it away lost the purchase. These persist in
// their own file until the user saves the pre-filled entry (which calls
// `clearIncompleteCapture`), and the drain re-surfaces the reminder on each
// launch/foreground until then.

const INCOMPLETE_FILE = 'wallet-capture-incomplete.jsonl'

function incompleteFile(): File {
  return new File(Paths.document, INCOMPLETE_FILE)
}

function readIncomplete(): WalletCaptureEntry[] {
  const f = incompleteFile()
  if (!f.exists) return []
  try {
    return f
      .textSync()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as WalletCaptureEntry)
      .filter((e) => typeof e.id === 'string')
  } catch {
    return []
  }
}

function writeIncomplete(entries: WalletCaptureEntry[]): void {
  const f = incompleteFile()
  try {
    if (entries.length === 0) {
      if (f.exists) f.delete()
      return
    }
    f.write(entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  } catch {
    /* best effort */
  }
}

/** Park an amount-less capture until the user resolves it. Idempotent. */
export function stashIncompleteCapture(entry: WalletCaptureEntry): void {
  const all = readIncomplete()
  if (!all.some((e) => e.id === entry.id)) writeIncomplete([...all, entry])
}

/** All captures still waiting for an amount (oldest first). */
export function pendingIncompleteCaptures(): WalletCaptureEntry[] {
  return readIncomplete()
}

/** The user saved (or explicitly abandoned) this capture — forget it. */
export function clearIncompleteCapture(id: string): void {
  writeIncomplete(readIncomplete().filter((e) => e.id !== id))
}

// ── Drain signalling ─────────────────────────────────────────────────────────

type Listener = () => void
const listeners = new Set<Listener>()

/** Ask the mounted drain to run now. */
export function poke(): void {
  for (const l of Array.from(listeners)) l()
}

export function onWalletCapturePoke(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

// ── Normalisation for the save path ─────────────────────────────────────────

export interface NormalisedCapture {
  id: string
  amount: number
  currency: string
  merchant: string | null
  capturedAt: string
}

/** Turn a raw entry into what `createTransaction` needs; null when the
 *  amount is unusable (refund / empty) — such entries are dropped. */
export function normaliseCapture(
  entry: WalletCaptureEntry,
  profileCurrency: string,
): NormalisedCapture | null {
  const amount = parseShortcutAmount(entry.amount)
  if (amount == null) return null
  const explicit = entry.currency.trim().toUpperCase()
  const currency =
    inferShortcutCurrency(entry.amount, /^[A-Z]{3}$/.test(explicit) ? explicit : '') ||
    profileCurrency
  const merchant = entry.merchant.trim() || null
  const capturedAt = Number.isFinite(Date.parse(entry.captured_at))
    ? entry.captured_at
    : new Date().toISOString()
  return { id: entry.id, amount, currency, merchant, capturedAt }
}
