import { GoogleGenAI } from '@google/genai'
import { validateToken } from '../../../../lib/auth'
import { getPrompt } from '@voice-expense/ai'
import type { Locale } from '@voice-expense/shared'
import type { NextRequest } from 'next/server'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export async function POST(req: NextRequest) {
  // 1. Auth
  const userId = await validateToken(req.headers.get('Authorization'))
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  let body: { transcript?: string; locale?: string; currency?: string; categories?: string[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { transcript, locale = 'en', currency = 'USD', categories = [] } = body
  if (!transcript || typeof transcript !== 'string') {
    return Response.json({ error: 'transcript is required' }, { status: 400 })
  }

  // 3. Build prompt
  const systemPrompt = getPrompt({
    locale: locale as Locale,
    currency,
    today: new Date().toISOString().split('T')[0],
    categories,
  })

  // 4. Call Gemini
  try {
    const response = await ai.models.generateContent({
      model: process.env.AI_PARSE_MODEL ?? 'gemini-2.5-flash',
      contents: transcript,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
      },
    })

    const text = response.text ?? ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return Response.json(parsed)
  } catch (err) {
    console.error('[parse-expense] Gemini error:', err)
    return Response.json({ error: 'AI parsing failed' }, { status: 500 })
  }
}
