import type { ReactElement, ReactNode, ComponentType } from 'react'
import type { WidgetDefinition } from '@/builder/types'
import type { AdminScreen, PublicRouteDef } from '@/core/pluginTypes'

export type PlatformFrontendContext = {
  slug: string
  version: string
  sdkVersion: number
  feature: (flag: string) => boolean
  admin: AdminSdk
  builder: BuilderSdk
  public: PublicSdk
}

export type AdminSdk = {
  registerPage: (screen: AdminScreen) => void
  registerNavItem: (item: {
    group: string
    path: string
    label: string
    permission?: string
    icon?: string
  }) => void
  registerSettingsSection: (screen: AdminScreen) => void
  registerDashboardCard: (card: { id: string; label: string; render: () => ReactNode }) => void
  registerTopBarButton: (btn: { id: string; label: string; onClick: () => void }) => void
  registerSearchProvider: (provider: { id: string; label: string; search: (q: string) => Promise<Array<{ title: string; href: string }>> }) => void
}

export type BuilderSdk = {
  registerWidget: (widget: WidgetDefinition) => void
  registerPropertyEditor: (type: string, editor: ComponentType<{ value: unknown; onChange: (v: unknown) => void }>) => void
  registerInspectorPanel: (panel: { id: string; label: string; render: () => ReactElement }) => void
  registerToolbarAction: (action: { id: string; label: string; run: () => void }) => void
  registerContextMenuItem: (item: { id: string; label: string; run: () => void }) => void
  registerBlockPreset: (preset: { id: string; label: string; blocks: unknown[] }) => void
  registerCategory: (category: string) => void
}

export type PublicSdk = {
  registerRoute: (route: PublicRouteDef) => void
  registerPathGate: (prefix: string) => void
}

export type JaseflyPlatformModule = {
  slug: string
  version: string
  sdkVersion?: number
  register: (ctx: PlatformFrontendContext) => void | Promise<void>
  unregister?: () => void | Promise<void>
}
