import OpenAI from 'openai'
import { validateToken } from '../../../../lib/auth'
import { buildAskMurmurPrompt, validateAskMurmurResponse } from '@voice-expense/ai'
import type { AskMurmurRequest } from '@voice-expense/shared'
import type { NextRequest } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
const MODEL = process.env.AI_ASK_MODEL ?? 'gpt-4o-mini'

// Defensive caps. The mobile client already trims, but we don't trust it.
const MAX_TRANSACTIONS = 500
const MAX_RECURRING = 50
const MAX_QUESTION_LEN = 600

/**
 * POST /api/ai/ask-murmur
 *
 * Grounded reasoner over the user's own transactions, income, and recurring
 * rules. The model is constrained to answer only from the data block we send
 * it, returning a structured JSON shape that the mobile result screen renders
 * directly. Out-of-scope questions (anything requiring external knowledge) are
 * politely refused via `out_of_scope: true`.
 */
export async function POST(req: NextRequest) {
  const userId = await validateToken(req.headers.get('Authorization'))
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<AskMurmurRequest>
  try {
    body = (await req.json()) as Partial<AskMurmurRequest>
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const question = (body.question ?? '').toString().trim()
  if (!question) {
    return Response.json({ error: 'question is required' }, { status: 400 })
  }
  if (question.length > MAX_QUESTION_LEN) {
    return Response.json({ error: 'question is too long' }, { status: 400 })
  }

  const transactions = Array.isArray(body.transactions)
    ? body.transactions.slice(-MAX_TRANSACTIONS)
    : []
  const recurring_rules = Array.isArray(body.recurring_rules)
    ? body.recurring_rules.slice(0, MAX_RECURRING)
    : []

  const askReq: AskMurmurRequest = {
    question,
    locale: (body.locale ?? 'en') as AskMurmurRequest['locale'],
    currency: (body.currency ?? 'USD').toString(),
    today: (body.today ?? new Date().toISOString().split('T')[0]).toString(),
    monthly_income:
      typeof body.monthly_income === 'number' ? body.monthly_income : null,
    transactions,
    recurring_rules,
  }

  const systemPrompt = buildAskMurmurPrompt(askReq)

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
    })

    const text = completion.choices[0].message.content ?? '{}'
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = {}
    }
    const result = validateAskMurmurResponse(parsed, transactions.length)
    return Response.json(result)
  } catch (err) {
    console.error('[ask-murmur] OpenAI error:', err)
    return Response.json({ error: 'AI request failed' }, { status: 500 })
  }
}
