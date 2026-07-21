import type { WidgetDefinition } from '@/builder/types'
import { isPluginEnabled } from '@/core/moduleRegistry'

const widgets = new Map<string, WidgetDefinition>()

/** Infer owning plugin when `def.plugin` is omitted. */
export function widgetRequiredPlugin(def: WidgetDefinition): string | null {
  if (def.plugin) return def.plugin
  if (def.category === 'portfolio') return 'portfolio'
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
  return null
}

export function registerWidget(def: WidgetDefinition) {
  widgets.set(def.type, def)
}

export function getWidget(type: string): WidgetDefinition | undefined {
  return widgets.get(type)
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
