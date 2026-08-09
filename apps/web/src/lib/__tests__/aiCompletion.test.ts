import { describe, it, expect, vi } from 'vitest'
import { createJsonCompletionWithRetry } from '../aiCompletion'
import type OpenAI from 'openai'

function fakeOpenAI(responses: Array<{ finish_reason: string; content: string }>) {
  const create = vi.fn()
  for (const r of responses) {
    create.mockResolvedValueOnce({
      choices: [{ finish_reason: r.finish_reason, message: { content: r.content } }],
    })
  }
  return { chat: { completions: { create } } } as unknown as OpenAI
}

describe('createJsonCompletionWithRetry', () => {
  it('returns the first response unchanged when it did not truncate', async () => {
    const openai = fakeOpenAI([{ finish_reason: 'stop', content: '{"amount":10}' }])
    const result = await createJsonCompletionWithRetry(openai, { model: 'x', messages: [], max_tokens: 300 } as never)
    expect(result.text).toBe('{"amount":10}')
    expect(result.retried).toBe(false)
    expect((openai.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('retries once with a higher max_tokens when the first response truncated', async () => {
    const openai = fakeOpenAI([
      { finish_reason: 'length', content: '{"amount":10,"currency":"US' },
      { finish_reason: 'stop', content: '{"amount":10,"currency":"USD"}' },
    ])
    const result = await createJsonCompletionWithRetry(openai, { model: 'x', messages: [], max_tokens: 300 } as never)
    expect(result.text).toBe('{"amount":10,"currency":"USD"}')
    expect(result.retried).toBe(true)
    const calls = (openai.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBe(2)
    expect(calls[1][0].max_tokens).toBe(450) // 300 * 1.5
  })

  it('caps the retry max_tokens rather than scaling unbounded', async () => {
    const openai = fakeOpenAI([
      { finish_reason: 'length', content: '{"a":1' },
      { finish_reason: 'stop', content: '{"a":1}' },
    ])
    await createJsonCompletionWithRetry(openai, { model: 'x', messages: [], max_tokens: 1000 } as never)
    const calls = (openai.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[1][0].max_tokens).toBe(1200)
  })

  it('does not retry a second time even if the retry also truncates', async () => {
    const openai = fakeOpenAI([
      { finish_reason: 'length', content: '{"a":1' },
      { finish_reason: 'length', content: '{"a":1,"b":2' },
    ])
    const result = await createJsonCompletionWithRetry(openai, { model: 'x', messages: [], max_tokens: 300 } as never)
    expect(result.retried).toBe(true)
    expect(result.text).toBe('{"a":1,"b":2') // still truncated — caller's JSON.parse/validator rejects it
    const calls = (openai.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBe(2)
  })
})
