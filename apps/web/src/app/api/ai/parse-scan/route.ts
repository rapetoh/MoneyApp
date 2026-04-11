import { GoogleGenerativeAI } from '@google/generative-ai'
import { validateToken } from '../../../../lib/auth'
import { getScanPrompt } from '@voice-expense/ai'
import type { NextRequest } from 'next/server'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Max image size: 4MB base64
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export async function POST(req: NextRequest) {
  // 1. Auth
  const userId = await validateToken(req.headers.get('Authorization'))
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse body
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

  // Size guard — reject oversized images
  if (imageBase64.length > MAX_IMAGE_BYTES * 1.37) {
    // base64 overhead is ~37%
    return Response.json({ error: 'Image too large. Max 4MB.' }, { status: 413 })
  }

  // IMPORTANT: the image is never stored — it is passed directly to Gemini and discarded.
  // Only the extracted structured data is returned and saved by the client.

  // 3. Build prompt
  const prompt = getScanPrompt(scanType, currency)

  // 4. Call Gemini vision
  try {
    const model = genai.getGenerativeModel({
      model: process.env.AI_PARSE_MODEL ?? 'gemini-2.0-flash',
      generationConfig: {
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
      },
    })

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64,
        },
      },
    ])

    const text = result.response.text()
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return Response.json(parsed)
  } catch (err) {
    console.error('[parse-scan] Gemini error:', err)
    return Response.json({ error: 'Scan parsing failed' }, { status: 500 })
  }
}
