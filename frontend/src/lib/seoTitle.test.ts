import { describe, expect, it } from 'vitest'
import { withSiteNameSuffix } from '@/lib/seoTitle'

describe('withSiteNameSuffix', () => {
  it('appends site name when missing', () => {
    expect(withSiteNameSuffix('Возможности', 'Jasefly CMS')).toBe('Возможности · Jasefly CMS')
  })

  it('does not duplicate when site name already present', () => {
    expect(withSiteNameSuffix('Политика конфиденциальности — Jasefly CMS', 'Jasefly CMS')).toBe(
      'Политика конфиденциальности — Jasefly CMS',
    )
  })

  it('is case-insensitive for the site name check', () => {
    expect(withSiteNameSuffix('About JASEFLY CMS', 'Jasefly CMS')).toBe('About JASEFLY CMS')
  })

  it('trims whitespace before comparing', () => {
    expect(withSiteNameSuffix('  Возможности  ', 'Jasefly CMS')).toBe('Возможности · Jasefly CMS')
    expect(withSiteNameSuffix('Jasefly CMS — modular', '  Jasefly CMS  ')).toBe('Jasefly CMS — modular')
  })

  it('returns site name when title is empty', () => {
    expect(withSiteNameSuffix('   ', 'Jasefly CMS')).toBe('Jasefly CMS')
  })
})
