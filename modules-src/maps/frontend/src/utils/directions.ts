import type { DirectionsService, DirectionsTarget, LatLng } from '../types'

export function isLatLng(v: unknown): v is LatLng {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as LatLng).lat === 'number' &&
    typeof (v as LatLng).lng === 'number' &&
    Number.isFinite((v as LatLng).lat) &&
    Number.isFinite((v as LatLng).lng)
  )
}

export function resolveDirectionsTarget(target: DirectionsTarget): {
  coords?: LatLng
  address?: string
} {
  if (typeof target === 'string') {
    return { address: target.trim() }
  }
  if (isLatLng(target)) {
    return { coords: { lat: target.lat, lng: target.lng } }
  }
  if (target && typeof target === 'object') {
    const address = typeof target.address === 'string' ? target.address.trim() : undefined
    const coords =
      typeof target.lat === 'number' &&
      typeof target.lng === 'number' &&
      Number.isFinite(target.lat) &&
      Number.isFinite(target.lng)
        ? { lat: target.lat, lng: target.lng }
        : undefined
    return { coords, address }
  }
  return {}
}

/** Build external directions URL (no in-map routing in v1). */
export function buildDirectionsUrl(
  target: DirectionsTarget,
  service: DirectionsService = 'osm',
): string | null {
  const { coords, address } = resolveDirectionsTarget(target)
  if (!coords && !address) return null

  if (service === 'google') {
    const q = coords ? `${coords.lat},${coords.lng}` : encodeURIComponent(address || '')
    return `https://www.google.com/maps/dir/?api=1&destination=${q}`
  }
  if (service === 'yandex') {
    if (coords) {
      return `https://yandex.ru/maps/?rtext=~${coords.lat},${coords.lng}&rtt=auto`
    }
    return `https://yandex.ru/maps/?text=${encodeURIComponent(address || '')}`
  }
  // osm / default — OpenStreetMap directions
  if (coords) {
    return `https://www.openstreetmap.org/directions?to=${coords.lat}%2C${coords.lng}`
  }
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address || '')}`
}

export function openDirections(
  target: DirectionsTarget,
  service: DirectionsService = 'osm',
): string | null {
  const url = buildDirectionsUrl(target, service)
  if (url && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  return url
}
