/**
 * Source mirror of frontend-dist/index.js — Platform SDK Maps module.
 * Runtime ships from frontend-dist/; keep this file aligned for docs/agents.
 */
import type { ModuleUiKit } from './types'

export type { LatLng, MapBounds, MapMarker, MapProps, MapProviderAdapter, MapHandle } from './types'
export { buildDirectionsUrl, openDirections } from './utils/directions'
export { computeBounds, normalizeMarkers, resolveCenter } from './utils/bounds'
export { createProviderRegistry, registerProvider, getProvider } from './providers/registry'
export { osmLeafletAdapter } from './providers/osmLeaflet'

export type PlatformFrontendContext = {
  slug: string
  version: string
  sdkVersion?: number
  ui?: ModuleUiKit
  admin?: {
    registerNavItem?: (item: Record<string, unknown>) => void
    registerPage?: (screen: Record<string, unknown>) => void
  }
  builder?: {
    registerWidget?: (widget: Record<string, unknown>) => void
  }
  public?: {
    registerRoute?: (route: {
      path: string
      label: string
      lazy: () => Promise<{ default: unknown }>
    }) => void
  }
  registerAdminNavItem?: (item: Record<string, unknown>) => void
  registerAdminRoute?: (screen: Record<string, unknown>) => void
}

export const JaseflyFrontendModule = {
  slug: 'maps',
  version: '1.0.1',
  sdkVersion: 1,

  async register(_ctx: PlatformFrontendContext): Promise<void> {
    // Runtime implementation: frontend-dist/index.js
  },

  async unregister(): Promise<void> {
    /* no-op */
  },
}

export default JaseflyFrontendModule
