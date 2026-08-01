import type { WidgetDefinition } from '@/builder/types'
import { isPluginEnabled } from '@/core/moduleRegistry'

const widgets = new Map<string, WidgetDefinition>()

/** Infer owning plugin when `def.plugin` is omitted. */
export function widgetRequiredPlugin(def: WidgetDefinition): string | null {
  if (def.plugin) return def.plugin
  // Static landing widgets (cta-banner, faq, …) must NOT inherit Portfolio.
  // Only widgets that actually pull portfolio data require the plugin.
  if (def.category === 'portfolio') {
    const portfolioDataWidgets = new Set([
      'hero',
      'projects-grid',
      'skills',
      'experience',
      'services',
      'testimonials',
      'profile-card',
    ])
    return portfolioDataWidgets.has(def.type) ? 'portfolio' : null
  }
  if (def.category === 'commerce') {
    if (
      def.type.startsWith('payment')
      || def.type === 'seller-info'
      || def.type === 'offer-document'
    ) {
      return 'payments'
    }
    return 'products'
  }
  if (def.type === 'auth-register') return 'registration'
  if (def.type === 'contact-form') return 'mail'
  if (def.type === 'blog-list') return 'blog'
  if (def.type === 'access-container') return 'access'
  return null
}

export function registerWidget(def: WidgetDefinition) {
  widgets.set(def.type, def)
}

export function getWidget(type: string): WidgetDefinition | undefined {
  return widgets.get(type)
}

export function unregisterWidget(type: string): void {
  widgets.delete(type)
}

export function listWidgets(category?: WidgetDefinition['category']): WidgetDefinition[] {
  const all = [...widgets.values()].filter((w) => {
    const plugin = widgetRequiredPlugin(w)
    return !plugin || isPluginEnabled(plugin)
  })
  return category ? all.filter((w) => w.category === category) : all
}

export function ensureWidgetsRegistered() {
  // side-effect import of widget modules
}
