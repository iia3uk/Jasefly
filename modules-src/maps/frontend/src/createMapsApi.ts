/**
 * Factory for Map / Marker / Popup using host React (`ctx.ui`).
 * Runtime: see frontend-dist/index.js → createMapsApi().
 */
import type { MapProps, ModuleUiKit } from './types'
import { buildDirectionsUrl, openDirections } from './utils/directions'

export type MapsApi = {
  Map: (props: MapProps) => unknown
  Marker: (props: Record<string, unknown>) => null
  Popup: (props: { children?: unknown }) => unknown
  openDirections: typeof openDirections
  buildDirectionsUrl: typeof buildDirectionsUrl
}

/** Declared for agents/docs; implementation ships in frontend-dist/index.js. */
export function createMapsApi(_ui: ModuleUiKit, _options?: { assetBase?: string }): MapsApi {
  throw new Error('Use frontend-dist/index.js createMapsApi at runtime')
}
