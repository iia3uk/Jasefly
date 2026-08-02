import { describe, expect, it } from 'vitest'
import { DEFAULT_DEMO_NAV_MODES, DEMO_NOTICE, demoModeForPath, demoSegment } from './demoNav'

describe('demoNav', () => {
  it('resolves segment from /admin/... paths', () => {
    expect(demoSegment('/admin/pages')).toBe('pages')
    expect(demoSegment('/admin/pages/1/builder')).toBe('pages')
    expect(demoSegment('pages')).toBe('pages')
    expect(demoSegment('/admin')).toBe('')
  })

  it('surfaces full admin as preview (not hidden)', () => {
    expect(demoModeForPath('/admin/updates')).toBe('preview')
    expect(demoModeForPath('plugins')).toBe('preview')
    expect(demoModeForPath('/admin/backup')).toBe('preview')
    expect(demoModeForPath('mcp')).toBe('preview')
    expect(demoModeForPath('/admin/users')).toBe('preview')
    expect(demoModeForPath('/admin/modules')).toBe('preview')
    expect(demoModeForPath('/admin/totally-unknown-section')).toBe('preview')
  })

  it('keeps builder surfaces interactive', () => {
    expect(demoModeForPath('/admin/pages')).toBe('interactive')
    expect(demoModeForPath('/admin/media')).toBe('interactive')
    expect(demoModeForPath('/admin/blog')).toBe('interactive')
  })

  it('exposes demo notice copy', () => {
    expect(DEMO_NOTICE).toContain('Production secrets')
    expect(DEFAULT_DEMO_NAV_MODES.pages).toBe('interactive')
  })
})
