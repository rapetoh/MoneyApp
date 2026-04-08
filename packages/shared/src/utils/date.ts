export function startOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function endOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

export function toISOString(date: Date = new Date()): string {
  return date.toISOString()
}

export function formatRelativeDate(isoString: string, locale: string = 'en'): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'

  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

export function formatTime(isoString: string, locale: string = 'en'): string {
  return new Date(isoString).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
