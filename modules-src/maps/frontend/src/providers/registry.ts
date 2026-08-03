import type { MapProviderAdapter } from '../types'
import { assertAdapter } from './adapter'

const adapters = new Map<string, MapProviderAdapter>()
let defaultId = 'osm'

export function registerProvider(adapter: MapProviderAdapter): void {
  assertAdapter(adapter)
  adapters.set(adapter.id, adapter)
}

export function getProvider(id?: string): MapProviderAdapter {
  const key = (id || defaultId || 'osm').toLowerCase()
  const found = adapters.get(key) || adapters.get(defaultId) || adapters.get('osm')
  if (!found) {
    throw new Error(`Map provider not registered: ${key}`)
  }
  return found
}

export function listProviders(): MapProviderAdapter[] {
  return [...adapters.values()]
}

export function setDefaultProvider(id: string): void {
  defaultId = id
}

export function createProviderRegistry() {
  return {
    register: registerProvider,
    get: getProvider,
    list: listProviders,
    setDefault: setDefaultProvider,
  }
}
