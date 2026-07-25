import type { ComponentType, ReactNode } from 'react'
import type { WidgetDefinition } from '@/builder/types'
import type { AdminScreen, PublicRouteDef } from '@/core/pluginTypes'

export type ModuleFrontendContext = {
  slug: string
  version: string
  registerAdminRoute: (screen: AdminScreen) => void
  registerAdminNavItem: (item: {
    group: string
    path: string
    label: string
    permission?: string
    icon?: string
  }) => void
  registerPublicRoute: (route: PublicRouteDef) => void
  registerBuilderWidget: (widget: WidgetDefinition) => void
  registerSettingsPage: (screen: AdminScreen) => void
  registerDashboardCard: (card: { id: string; label: string; render: () => ReactNode }) => void
  registerTranslation: (locale: string, messages: Record<string, string>) => void
}

export type JaseflyFrontendModule = {
  slug: string
  version: string
  register: (context: ModuleFrontendContext) => void | Promise<void>
  unregister?: (context: ModuleFrontendContext) => void | Promise<void>
}

export type RuntimeModuleAsset = {
  slug: string
  version: string
  name?: string
  status: string
  entry?: string
  css?: string[]
  integrity?: Record<string, string>
  exports?: Record<string, unknown>
}
