import { describe, it, expect } from 'vitest'
import { publicOrigin } from '../publicOrigin'

const req = (url: string, headers: Record<string, string>) => new Request(url, { headers })

describe('publicOrigin', () => {
  it('desktop: the gateway address, not the embedded server one', () => {
    expect(
      publicOrigin(req('http://localhost:60297/auth/callback', { host: '127.0.0.1:60300' })),
    ).toBe('http://127.0.0.1:60300')
  })
  it('Vercel: the forwarded host over https', () => {
    expect(
      publicOrigin(
        req('https://itsmurmur.com/auth/callback', {
          host: 'itsmurmur.com',
          'x-forwarded-host': 'itsmurmur.com',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://itsmurmur.com')
  })
  it('a forged host never becomes a redirect target', () => {
    expect(
      publicOrigin(
        req('https://itsmurmur.com/auth/callback', {
          host: 'evil.example',
          'x-forwarded-host': 'evil.example',
        }),
      ),
    ).toBe('https://itsmurmur.com')
  })
  it('no host header: the request URL', () => {
    expect(publicOrigin(req('http://localhost:3000/x', {}))).toBe('http://localhost:3000')
  })
})
