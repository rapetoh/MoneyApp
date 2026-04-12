import OpenAI from 'openai'
import { validateToken } from '../../../../lib/auth'
import { getPrompt } from '@voice-expense/ai'
import type { Locale } from '@voice-expense/shared'
import type { NextRequest } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
const MODEL = process.env.AI_PARSE_MODEL ?? 'gpt-4o-mini'

export async function POST(req: NextRequest) {
  const userId = await validateToken(req.headers.get('Authorization'))
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const systemPrompt = getPrompt({
    locale: locale as Locale,
    currency,
    today: new Date().toISOString().split('T')[0],
    categories,
  })

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript },
      ],
    })

    const text = completion.choices[0].message.content ?? '{}'
    const parsed = JSON.parse(text)
    return Response.json(parsed)
  } catch (err) {
    console.error('[parse-expense] OpenAI error:', err)
    return Response.json({ error: 'AI parsing failed' }, { status: 500 })
  }
}
