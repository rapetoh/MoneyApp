export function formatCurrency(
  amount: number,
  currencyCode: string,
  locale: string = 'en',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatAmount(amount: number, locale: string = 'en'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Deterministic color from a string (for merchant avatar fallback)
export function merchantColor(name: string): string {
  const colors = [
    '#E85D04',
    '#F48C06',
    '#2D6A4F',
    '#1B4332',
    '#264653',
    '#2A9D8F',
    '#6D6875',
    '#B5838D',
    '#457B9D',
    '#1D3557',
    '#C77DFF',
    '#7B2D8B',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
