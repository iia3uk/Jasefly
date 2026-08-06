import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from './sanitize'

describe('sanitizeHtml', () => {
  it('strips script tags', () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script>')
    expect(out.toLowerCase()).not.toContain('<script')
    expect(out).toContain('ok')
  })

  it('strips onerror / event handlers', () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)"><p onclick="evil()">t</p>')
    expect(out.toLowerCase()).not.toMatch(/\sonerror\s*=/)
    expect(out.toLowerCase()).not.toMatch(/\sonclick\s*=/)
    expect(out).toContain('t')
  })

  it('neutralizes javascript: URLs', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    expect(out.toLowerCase()).not.toContain('javascript:')
  })

  it('keeps safe formatting markup', () => {
    const safe = '<p>Hello <strong>world</strong></p><ul><li>one</li></ul>'
    const out = sanitizeHtml(safe)
    expect(out).toContain('<strong>world</strong>')
    expect(out).toContain('<li>one</li>')
  })
})
