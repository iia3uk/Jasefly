import { registerBasicWidgets } from '@/builder/widgets/basic'
import { registerLandingWidgets } from '@/builder/widgets/landing'
import { registerPortfolioWidgets } from '@/builder/widgets/portfolio'
import { registerCommerceWidgets } from '@/builder/widgets/commerce'
import { registerAuthWidgets } from '@/builder/widgets/auth'
import { registerWidget } from '@/builder/registry'
import { getBlocks } from '@/core/moduleRegistry'

let ready = false

export function initBuilderWidgets() {
  if (ready) return
  // Core built-in widgets (structure + basic + landing + portfolio + commerce + auth).
  registerBasicWidgets()
  registerLandingWidgets()
  registerPortfolioWidgets()
  registerCommerceWidgets()
  registerAuthWidgets()

  // Plugin-contributed blocks: each manifest block carries a renderer +
  // settings schema. We bridge them into the builder widget registry so the
  // editor palette and the public renderer pick them up automatically.
  for (const block of getBlocks()) {
    registerWidget({
      type: block.type,
      label: block.label,
      category: block.category,
      icon: block.icon,
      defaultSettings: block.defaultSettings,
      settingsFields: block.settingsFields,
      Render: block.Render,
    })
  }
  ready = true
}
