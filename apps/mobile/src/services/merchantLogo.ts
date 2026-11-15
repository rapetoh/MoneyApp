import { Image } from 'expo-image'
import { merchantLogoUrl } from '@voice-expense/shared'
import type { Transaction, RecurringRule } from '@voice-expense/shared'

/**
 * The one place a merchant logo URL is built lives in shared
 * (`merchantLogoUrl`, also used by the web and the server's bill
 * notifications). `MerchantAvatar` renders it, `prefetchMerchantLogos`
 * warms it. Google's favicon service, fetched directly (see color.ts's
 * rationale for not proxying).
 */
export { merchantLogoUrl }

// URLs already handed to the cache this process — a repeat call for the
// same set is a no-op, so every data hook can call `prefetchMerchantLogos`
// on every reload without doing repeated work.
const requested = new Set<string>()

/**
 * Warms expo-image's memory+disk cache for every logo a list will render,
 * as soon as the data arrives — before the rows mount. With the disk cache
 * this makes logos part of the row on every launch after the first, and
 * on the first launch it lets the whole set land together rather than one
 * row at a time as each `<Image>` mounts and fetches on its own.
 */
export function prefetchMerchantLogos(
  items: Array<Pick<Transaction, 'merchant' | 'merchant_domain'> | Pick<RecurringRule, 'name'>>,
): void {
  const fresh: string[] = []
  for (const item of items) {
    const merchant = 'merchant' in item ? item.merchant : item.name
    const domain = 'merchant_domain' in item ? item.merchant_domain : null
    const url = merchantLogoUrl(merchant, domain)
    if (url && !requested.has(url)) {
      requested.add(url)
      fresh.push(url)
    }
  }
  if (fresh.length === 0) return
  // Fire-and-forget; a failed prefetch just means the row's own load does
  // the work (and falls back to the letter tile on a real 404).
  Image.prefetch(fresh, 'memory-disk').catch(() => {})
}
