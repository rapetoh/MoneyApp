// Unit tests for the environment validation module — fix-plan item 1.2
// ("Add one env.ts per app that reads and validates every required
// variable at startup and throws one actionable error naming the missing
// keys"). Each test gets a fresh module instance (`vi.resetModules()` +
// dynamic import) so the module-level cache in env.ts can never leak a
// result — or a throw — from one test's `process.env` into the next.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'OPENAI_API_KEY'] as const

let originalEnv: Record<string, string | undefined>

beforeEach(() => {
  originalEnv = { ...process.env }
  for (const key of ENV_KEYS) delete process.env[key]
})

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  Object.assign(process.env, originalEnv)
  vi.resetModules()
})

async function freshEnvModule() {
  vi.resetModules()
  return import('../env')
}

describe('getSupabaseEnv', () => {
  it('returns both values when set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    const { getSupabaseEnv } = await freshEnvModule()
    expect(getSupabaseEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })
  })

  it('throws a named MissingEnvError naming every missing key, not just the first', async () => {
    const { getSupabaseEnv, MissingEnvError } = await freshEnvModule()
    let caught: unknown
    try {
      getSupabaseEnv()
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(MissingEnvError)
    const err = caught as InstanceType<typeof MissingEnvError>
    expect(err.message).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(err.message).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })

  it('throws when only one of the two is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    const { getSupabaseEnv, MissingEnvError } = await freshEnvModule()
    expect(() => getSupabaseEnv()).toThrow(MissingEnvError)
  })

  it('caches the validated value — a second call does not re-read process.env', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    const { getSupabaseEnv } = await freshEnvModule()
    const first = getSupabaseEnv()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(getSupabaseEnv()).toBe(first)
  })
})

describe('getOpenAIEnv', () => {
  it('returns the key when set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const { getOpenAIEnv } = await freshEnvModule()
    expect(getOpenAIEnv()).toEqual({ OPENAI_API_KEY: 'sk-test' })
  })

  it('throws a named MissingEnvError when unset', async () => {
    const { getOpenAIEnv, MissingEnvError } = await freshEnvModule()
    expect(() => getOpenAIEnv()).toThrow(MissingEnvError)
  })

  it('is independent of getSupabaseEnv — missing Supabase vars do not affect it', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const { getOpenAIEnv } = await freshEnvModule()
    expect(() => getOpenAIEnv()).not.toThrow()
  })
})
