import { registerBasicWidgets } from '@/builder/widgets/basic'
import { registerStructureWidgets } from '@/builder/widgets/structure'
import { registerBlockWidgets } from '@/builder/widgets/blocks'
import { registerPanelWidgets } from '@/builder/widgets/panels'
import { registerLandingWidgets } from '@/builder/widgets/landing'
import { registerProcessDiagramWidgets } from '@/builder/widgets/processDiagram'
import { registerFrameworkWidgets } from '@/builder/widgets/framework'
import { registerFrameworkPulseWidgets } from '@/builder/widgets/frameworkPulse'
import { registerPortfolioWidgets } from '@/builder/widgets/portfolio'
import { registerJourneyWidgets } from '@/builder/widgets/journey'
import { registerCommerceWidgets } from '@/builder/widgets/commerce'
import { registerAuthWidgets } from '@/builder/widgets/auth'
import { registerAccessWidgets } from '@/builder/widgets/access'
import { registerFormWidgets } from '@/builder/widgets/forms'
import { registerNewsletterWidgets } from '@/builder/widgets/newsletter'
import { registerCommentWidgets } from '@/builder/widgets/comments'
import { registerWidget } from '@/builder/registry'
import { getBlocks } from '@/core/moduleRegistry'

let ready = false

export function initBuilderWidgets() {
  if (ready) return
  // Core built-in widgets (structure + basic + landing + portfolio + commerce + auth).
  registerBasicWidgets()
  registerStructureWidgets()
  registerBlockWidgets()
  registerPanelWidgets()
  registerLandingWidgets()
  registerProcessDiagramWidgets()
  registerFrameworkWidgets()
  registerFrameworkPulseWidgets()
  registerPortfolioWidgets()
  registerJourneyWidgets()
  registerCommerceWidgets()
  registerAuthWidgets()
  registerAccessWidgets()
  registerFormWidgets()
  registerNewsletterWidgets()
  registerCommentWidgets()

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
