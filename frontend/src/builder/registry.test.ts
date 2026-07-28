import { describe, expect, it } from 'vitest'
import type { WidgetDefinition } from '@/builder/types'
import { widgetRequiredPlugin } from '@/builder/registry'

const stub = (partial: Pick<WidgetDefinition, 'type' | 'category'> & { plugin?: string }): WidgetDefinition => ({
  type: partial.type,
  label: partial.type,
  category: partial.category,
  plugin: partial.plugin,
  defaultSettings: {},
  settingsFields: [],
  Render: () => null,
})

describe('widgetRequiredPlugin', () => {
  it('does not gate static portfolio-category marketing widgets as portfolio', () => {
    expect(widgetRequiredPlugin(stub({ type: 'cta-banner', category: 'portfolio' }))).toBeNull()
    expect(widgetRequiredPlugin(stub({ type: 'contact-form', category: 'basic' }))).toBe('mail')
    expect(widgetRequiredPlugin(stub({ type: 'blog-list', category: 'basic' }))).toBe('blog')
  })

  it('gates portfolio data widgets', () => {
    expect(widgetRequiredPlugin(stub({ type: 'projects-grid', category: 'portfolio' }))).toBe('portfolio')
    expect(widgetRequiredPlugin(stub({ type: 'hero', category: 'portfolio' }))).toBe('portfolio')
    expect(widgetRequiredPlugin(stub({ type: 'skills', category: 'portfolio' }))).toBe('portfolio')
  })

  it('respects explicit plugin and commerce/auth rules', () => {
    expect(widgetRequiredPlugin(stub({ type: 'custom', category: 'basic', plugin: 'lab' }))).toBe('lab')
    expect(widgetRequiredPlugin(stub({ type: 'product-card', category: 'commerce' }))).toBe('products')
    expect(widgetRequiredPlugin(stub({ type: 'payment-button', category: 'commerce' }))).toBe('payments')
    expect(widgetRequiredPlugin(stub({ type: 'auth-register', category: 'basic' }))).toBe('registration')
  })
})
