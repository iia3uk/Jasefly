import { describe, expect, it } from 'vitest'
import { resolvePackageWidgetType } from '@/platform/resolvePackageWidgetType'

describe('resolvePackageWidgetType', () => {
  it('namespaces by default', () => {
    expect(resolvePackageWidgetType('demo-kit', 'ping')).toBe('demo-kit.ping')
  })

  it('keeps already-dotted types', () => {
    expect(resolvePackageWidgetType('demo-kit', 'demo-kit.ping')).toBe('demo-kit.ping')
  })

  it('honours stableType for frozen public widget ids', () => {
    expect(resolvePackageWidgetType('comments', 'comments', true)).toBe('comments')
    expect(resolvePackageWidgetType('comments', 'rating-summary', true)).toBe('rating-summary')
    expect(resolvePackageWidgetType('comments', 'review-form', true)).toBe('review-form')
    expect(resolvePackageWidgetType('comments', 'reviews', true)).toBe('reviews')
    expect(resolvePackageWidgetType('forms', 'form', true)).toBe('form')
    expect(resolvePackageWidgetType('newsletter', 'newsletter-signup', true)).toBe('newsletter-signup')
  })

  it('rejects unsafe stableType ids via namespaced fallback', () => {
    expect(resolvePackageWidgetType('comments', 'Bad Type', true)).toBe('comments.Bad Type')
  })
})
