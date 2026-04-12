import OpenAI from 'openai'
import { validateToken } from '../../../../lib/auth'
import { getScanPrompt } from '@voice-expense/ai'
import type { NextRequest } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
const MODEL = process.env.AI_SCAN_MODEL ?? 'gpt-4o-mini'

const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export async function POST(req: NextRequest) {
  const userId = await validateToken(req.headers.get('Authorization'))
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { imageBase64?: string; scanType?: 'receipt' | 'paycheck'; currency?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { imageBase64, scanType = 'receipt', currency = 'USD' } = body

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return Response.json({ error: 'imageBase64 is required' }, { status: 400 })
  }

  if (imageBase64.length > MAX_IMAGE_BYTES * 1.37) {
    return Response.json({ error: 'Image too large. Max 4MB.' }, { status: 413 })
  }

  const prompt = getScanPrompt(scanType, currency)

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
    })

    const text = completion.choices[0].message.content ?? '{}'
    const parsed = JSON.parse(text)
    return Response.json(parsed)
  } catch (err) {
    console.error('[parse-scan] OpenAI error:', err)
    return Response.json({ error: 'Scan parsing failed' }, { status: 500 })
  }
}
