/** Public Maps module types (v1). */

export type LatLng = { lat: number; lng: number }

export type MapBounds = {
  south: number
  west: number
  north: number
  east: number
}

export type MapMarker = {
  id: string
  lat: number
  lng: number
  title?: string
  description?: string
  iconUrl?: string
  iconSize?: [number, number]
  onClick?: (marker: MapMarker) => void
}

export type DirectionsService = 'osm' | 'google' | 'yandex'

export type DirectionsTarget =
  | LatLng
  | string
  | { lat: number; lng: number; address?: string }
  | { address: string; lat?: number; lng?: number }

export type DirectionsOptions = {
  target: DirectionsTarget
  service?: DirectionsService
  open?: boolean
}

export type MapProps = {
  center?: LatLng
  zoom?: number
  markers?: MapMarker[]
  height?: string | number
  className?: string
  interactive?: boolean
  scrollWheelZoom?: boolean
  dragging?: boolean
  fitBounds?: boolean
  showReset?: boolean
  showZoomControls?: boolean
  provider?: string
  apiKey?: string
  mapStyle?: string
  locale?: string
  address?: string
  ariaLabel?: string
  showDirectionsLink?: boolean
  directions?: DirectionsOptions
  forceError?: boolean
  onMapClick?: (ll: LatLng) => void
  onMarkerClick?: (marker: MapMarker) => void
  onBoundsChange?: (bounds: MapBounds) => void
  onZoomChange?: (zoom: number) => void
  onReady?: () => void
  onError?: (error: Error) => void
}

export type MapInitOptions = {
  center: LatLng
  zoom: number
  interactive: boolean
  scrollWheelZoom: boolean
  dragging: boolean
  mapStyle?: string
  apiKey?: string
  locale?: string
  assetBase: string
}

export type MapEventMap = {
  click: (ll: LatLng) => void
  zoom: (zoom: number) => void
  moveend: (bounds: MapBounds) => void
  error: (error: Error) => void
}

export type MapHandle = {
  setView: (center: LatLng, zoom?: number) => void
  setZoom: (zoom: number) => void
  fitBounds: (bounds: MapBounds, padding?: number) => void
  addMarker: (marker: MapMarker) => void
  removeMarker: (id: string) => void
  clearMarkers: () => void
  openPopup: (id: string) => void
  getBounds: () => MapBounds | null
  getZoom: () => number
  getCenter: () => LatLng
  on: <K extends keyof MapEventMap>(event: K, handler: MapEventMap[K]) => void
  off: <K extends keyof MapEventMap>(event: K, handler: MapEventMap[K]) => void
}

export type MapProviderAdapter = {
  id: string
  label: string
  load: (assetBase: string) => Promise<void>
  createMap: (container: HTMLElement, options: MapInitOptions) => MapHandle
  destroy: (handle: MapHandle) => void
}

export type ModuleUiKit = {
  createElement: typeof import('react').createElement
  useState: typeof import('react').useState
  useEffect: typeof import('react').useEffect
  Fragment: typeof import('react').Fragment
}
