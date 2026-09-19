import { describe, expect, it } from 'vitest'
import { effectiveVoiceLanguage, resolveCurrency, voiceLanguageFor } from '../setup'

describe('resolveCurrency', () => {
  it('keeps a supported device currency', () => {
    expect(resolveCurrency('EUR')).toBe('EUR')
    expect(resolveCurrency('xof')).toBe('XOF')
  })
  it('falls back to USD for unknown or missing codes', () => {
    expect(resolveCurrency('ARS')).toBe('USD')
    expect(resolveCurrency(null)).toBe('USD')
  })
})

describe('voiceLanguageFor', () => {
  it('pairs the app language with a supported device region', () => {
    expect(voiceLanguageFor('fr', 'CA')).toBe('fr-CA')
    expect(voiceLanguageFor('en', 'gb')).toBe('en-GB')
  })
  it('uses the language default when the region does not pair', () => {
    expect(voiceLanguageFor('fr', 'SN')).toBe('fr-FR')
    expect(voiceLanguageFor('pt', null)).toBe('pt-BR')
  })
})

describe('effectiveVoiceLanguage', () => {
  it('treats the untouched en-US default as unset for a French profile', () => {
    expect(effectiveVoiceLanguage('en-US', 'fr', 'FR')).toBe('fr-FR')
  })
  it('keeps a stored value that matches the app language', () => {
    expect(effectiveVoiceLanguage('en-GB', 'en', 'US')).toBe('en-GB')
  })
})
