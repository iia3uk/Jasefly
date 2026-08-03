import type { MapHandle, MapInitOptions, MapProviderAdapter } from '../types'

export type { MapHandle, MapInitOptions, MapProviderAdapter }

/** Extension point for Google / Yandex / Mapbox without changing Map public API. */
export function assertAdapter(adapter: MapProviderAdapter): void {
  if (!adapter?.id || typeof adapter.load !== 'function' || typeof adapter.createMap !== 'function') {
    throw new Error('Invalid MapProviderAdapter')
  }
}
