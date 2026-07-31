import type { ReactElement, ReactNode, ComponentType } from 'react'

/** Self-contained platform SDK types (no host imports — safe for package bundles). */

export type PlatformSettingsField =
  | { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'url' | 'color' | 'date' | 'datetime' | 'json' | 'code' | 'hidden'; bindable?: boolean }
  | { key: string; label: string; type: 'select'; options: Array<{ value: string; label: string }> }
  | { key: string; label: string; type: 'toggle' }
  | { key: string; label: string; type: 'media'; bindable?: boolean }
  | { key: string; label: string; type: 'richtext'; bindable?: boolean }
  | { key: string; label: string; type: 'custom'; component: ComponentType<{ value: unknown; onChange: (v: unknown) => void }> }

export type PlatformAdminScreen = {
  path: string
  label: string
  group: string
  permission?: string
  fullscreen?: boolean
  Component?: ComponentType<Record<string, never>>
  lazy?: () => Promise<{ default: ComponentType<Record<string, never>> }>
  element?: ReactElement
}

export type PlatformPublicRouteDef = {
  path: string
  label: string
  lazy: () => Promise<{ default: ComponentType<unknown> }>
}

export type PlatformWidgetDefinition = {
  type: string
  label: string
  category: 'structure' | 'basic' | 'portfolio' | 'commerce' | 'integration' | (string & {})
  icon?: string
  plugin?: string
  defaultSettings: Record<string, unknown>
  settingsFields: PlatformSettingsField[]
  Render: ComponentType<{ settings: Record<string, unknown>; editMode?: boolean }>
}

export type PlatformFrontendContext = {
  slug: string
  version: string
  sdkVersion: number
  feature: (flag: string) => boolean
  ui: {
    createElement: typeof import('react').createElement
    useState: typeof import('react').useState
    useEffect: typeof import('react').useEffect
    Fragment: typeof import('react').Fragment
    createRoot?: typeof import('react-dom/client').createRoot
  }
  admin: AdminSdk
  builder: BuilderSdk
  public: PublicSdk
}

export type AdminSdk = {
  registerPage: (screen: PlatformAdminScreen) => void
  registerNavItem: (item: {
    group: string
    path: string
    label: string
    permission?: string
    icon?: string
  }) => void
  registerSettingsSection: (screen: PlatformAdminScreen) => void
  registerDashboardCard: (card: { id: string; label: string; render: () => ReactNode }) => void
  registerTopBarButton: (btn: { id: string; label: string; onClick: () => void }) => void
  registerSearchProvider: (provider: { id: string; label: string; search: (q: string) => Promise<Array<{ title: string; href: string }>> }) => void
}

export type BuilderSdk = {
  registerWidget: (widget: PlatformWidgetDefinition) => void
  registerPropertyEditor: (type: string, editor: ComponentType<{ value: unknown; onChange: (v: unknown) => void }>) => void
  registerInspectorPanel: (panel: { id: string; label: string; render: () => ReactElement }) => void
  registerToolbarAction: (action: { id: string; label: string; run: () => void }) => void
  registerContextMenuItem: (item: { id: string; label: string; run: () => void }) => void
  registerBlockPreset: (preset: { id: string; label: string; blocks: unknown[] }) => void
  registerCategory: (category: string) => void
}

export type PublicSdk = {
  registerRoute: (route: PlatformPublicRouteDef) => void
  registerPathGate: (prefix: string) => void
}

export type JaseflyPlatformModule = {
  slug: string
  version: string
  sdkVersion?: number
  register: (ctx: PlatformFrontendContext) => void | Promise<void>
  unregister?: () => void | Promise<void>
}
