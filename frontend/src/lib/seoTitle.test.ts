import { describe, expect, it } from 'vitest'
import { withSiteNameSuffix } from './seoTitle'

describe('withSiteNameSuffix', () => {
  it('appends site name when missing', () => {
    expect(withSiteNameSuffix('Возможности', 'Jasefly')).toBe('Возможности · Jasefly')
  })

  it('keeps title that already ends with site name (em dash)', () => {
    expect(withSiteNameSuffix('Политика конфиденциальности — Jasefly', 'Jasefly')).toBe(
      'Политика конфиденциальности — Jasefly',
    )
  })

  it('keeps title that already contains site name case-insensitively', () => {
    expect(withSiteNameSuffix('About JASEFLY', 'Jasefly')).toBe('About JASEFLY')
  })

  it('trims whitespace', () => {
    expect(withSiteNameSuffix('  Возможности  ', 'Jasefly')).toBe('Возможности · Jasefly')
    expect(withSiteNameSuffix('Jasefly — modular', '  Jasefly  ')).toBe('Jasefly — modular')
  })

  it('falls back to site name for empty title', () => {
    expect(withSiteNameSuffix('   ', 'Jasefly')).toBe('Jasefly')
  })
})
