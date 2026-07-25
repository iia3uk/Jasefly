/**
 * Source mirror of frontend-dist/index.js — Platform SDK contract documentation.
 * No @/ imports; host injects ctx.ui at runtime.
 */

export type ModuleUiKit = {
  createElement: typeof import('react').createElement
  useState: typeof import('react').useState
  useEffect: typeof import('react').useEffect
  Fragment: typeof import('react').Fragment
}

export type PlatformFrontendContext = {
  slug: string
  version: string
  sdkVersion?: number
  ui?: ModuleUiKit
  admin?: {
    registerNavItem?: (item: AdminNavItem) => void
    registerPage?: (screen: AdminScreen) => void
  }
  builder?: {
    registerWidget?: (widget: BuilderWidget) => void
  }
  registerAdminNavItem?: (item: AdminNavItem) => void
  registerAdminRoute?: (screen: AdminScreen) => void
}

export type AdminNavItem = {
  group: string
  path: string
  label: string
  permission?: string
  icon?: string
}

export type AdminScreen = {
  path: string
  label: string
  group: string
  permission?: string
  Component?: () => unknown
}

export type BuilderWidget = {
  type: string
  label: string
  category?: string
  icon?: string
  defaultSettings?: Record<string, unknown>
  settingsFields?: Array<Record<string, unknown>>
  Render?: (props: { settings?: Record<string, unknown>; mode?: string }) => unknown
}

export const JaseflyFrontendModule = {
  slug: 'forms-sdk-reference',
  version: '1.0.0',
  sdkVersion: 1,

  async register(_ctx: PlatformFrontendContext): Promise<void> {
    // Runtime implementation lives in frontend-dist/index.js (hand-written ESM).
    // Rebuild: edit frontend-dist/index.js directly for certify, or sync from here.
  },

  async unregister(): Promise<void> {
    /* no-op */
  },
}

export default JaseflyFrontendModule
