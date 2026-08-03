import type { LatLng, MapBounds, MapMarker } from '../types'

export function computeBounds(points: Array<LatLng | MapMarker>): MapBounds | null {
  const valid = points.filter(
    (p) =>
      p &&
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng),
  )
  if (valid.length === 0) return null
  let south = valid[0].lat
  let north = valid[0].lat
  let west = valid[0].lng
  let east = valid[0].lng
  for (const p of valid) {
    if (p.lat < south) south = p.lat
    if (p.lat > north) north = p.lat
    if (p.lng < west) west = p.lng
    if (p.lng > east) east = p.lng
  }
  // Pad single-point bounds slightly so fitBounds has area
  if (south === north) {
    south -= 0.002
    north += 0.002
  }
  if (west === east) {
    west -= 0.002
    east += 0.002
  }
  return { south, west, north, east }
}

export function normalizeMarkers(input: unknown): import('../types').MapMarker[] {
  if (!Array.isArray(input)) return []
  const out: import('../types').MapMarker[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const lat = Number(r.lat)
    const lng = Number(r.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const id = r.id != null && String(r.id) !== '' ? String(r.id) : `m-${out.length + 1}`
    out.push({
      id,
      lat,
      lng,
      title: typeof r.title === 'string' ? r.title : undefined,
      description: typeof r.description === 'string' ? r.description : undefined,
      iconUrl: typeof r.iconUrl === 'string' ? r.iconUrl : typeof r.icon_url === 'string' ? r.icon_url : undefined,
    })
  }
  return out
}

export function resolveCenter(
  center: LatLng | undefined,
  markers: Array<LatLng | MapMarker>,
  fallback: LatLng = { lat: 55.7558, lng: 37.6173 },
): LatLng {
  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    return { lat: center.lat, lng: center.lng }
  }
  if (markers.length === 1) {
    return { lat: markers[0].lat, lng: markers[0].lng }
  }
  const b = computeBounds(markers)
  if (b) {
    return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 }
  }
  return fallback
}
