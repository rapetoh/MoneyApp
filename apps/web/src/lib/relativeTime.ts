/**
 * "5 minutes ago" / "yesterday" / "3 days ago" via `Intl.RelativeTimeFormat`
 * rather than a hand-rolled English-only string — used by the sidebar's
 * sync status and Settings' "Sync & devices" card (fix-plan 3.7, "A sync
 * surface that reports reality"). Both used to hardcode "Synced just now"
 * unconditionally; this is the one formatter both now read a real
 * `devices.last_synced_at` value through.
 */
export function formatRelativeSync(iso: string | null | undefined, locale: string = 'en'): string {
  if (!iso) return 'Not synced yet'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    if (minutes < 1) return `Synced ${rtf.format(0, 'minute')}`
    if (minutes < 60) return `Synced ${rtf.format(-minutes, 'minute')}`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `Synced ${rtf.format(-hours, 'hour')}`
    return `Synced ${rtf.format(-Math.round(hours / 24), 'day')}`
  } catch {
    return `Synced ${new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`
  }
}
