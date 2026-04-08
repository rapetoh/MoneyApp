import type { ParsedExpense } from '@voice-expense/shared'

export type ScanType = 'receipt' | 'paycheck'

export interface ScanOptions {
  imageBase64: string
  scanType: ScanType
  currency: string
  apiBaseUrl: string
  authToken: string
}

export async function parseScan(opts: ScanOptions): Promise<ParsedExpense> {
  const response = await fetch(`${opts.apiBaseUrl}/api/ai/parse-scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.authToken}`,
    },
    body: JSON.stringify({
      imageBase64: opts.imageBase64,
      scanType: opts.scanType,
      currency: opts.currency,
    }),
  })

  if (!response.ok) {
    throw new Error(`Scan parse failed: ${response.status}`)
  }

  return response.json() as Promise<ParsedExpense>
}
