/**
 * Pure Maps core — directions, bounds, markers, provider registry.
 * Shared by frontend-dist/index.js and node tests (no DOM).
 */

export function isLatLng(v) {
  return !!v && typeof v === 'object' && typeof v.lat === 'number' && typeof v.lng === 'number'
    && Number.isFinite(v.lat) && Number.isFinite(v.lng)
}

export function resolveDirectionsTarget(target) {
  if (typeof target === 'string') return { address: target.trim() }
  if (isLatLng(target)) return { coords: { lat: target.lat, lng: target.lng } }
  if (target && typeof target === 'object') {
    const address = typeof target.address === 'string' ? target.address.trim() : undefined
    const coords =
      typeof target.lat === 'number' && typeof target.lng === 'number'
      && Number.isFinite(target.lat) && Number.isFinite(target.lng)
        ? { lat: target.lat, lng: target.lng }
        : undefined
    return { coords, address }
  }
  return {}
}

export function buildDirectionsUrl(target, service = 'osm') {
  const { coords, address } = resolveDirectionsTarget(target)
  if (!coords && !address) return null
  if (service === 'google') {
    const q = coords ? `${coords.lat},${coords.lng}` : encodeURIComponent(address || '')
    return `https://www.google.com/maps/dir/?api=1&destination=${q}`
  }
  if (service === 'yandex') {
    if (coords) return `https://yandex.ru/maps/?rtext=~${coords.lat},${coords.lng}&rtt=auto`
    return `https://yandex.ru/maps/?text=${encodeURIComponent(address || '')}`
  }
  if (coords) return `https://www.openstreetmap.org/directions?to=${coords.lat}%2C${coords.lng}`
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address || '')}`
}

export function openDirections(target, service = 'osm') {
  const url = buildDirectionsUrl(target, service)
  if (url && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  return url
}

export function computeBounds(points) {
  const valid = (points || []).filter(
    (p) => p && typeof p.lat === 'number' && typeof p.lng === 'number'
      && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  )
  if (!valid.length) return null
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
  if (south === north) { south -= 0.002; north += 0.002 }
  if (west === east) { west -= 0.002; east += 0.002 }
  return { south, west, north, east }
}

export function normalizeMarkers(input) {
  if (!Array.isArray(input)) return []
  const out = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const lat = Number(raw.lat)
    const lng = Number(raw.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const id = raw.id != null && String(raw.id) !== '' ? String(raw.id) : `m-${out.length + 1}`
    out.push({
      id,
      lat,
      lng,
      title: typeof raw.title === 'string' ? raw.title : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      iconUrl: typeof raw.iconUrl === 'string' ? raw.iconUrl
        : typeof raw.icon_url === 'string' ? raw.icon_url : undefined,
    })
  }
  return out
}

export function resolveCenter(center, markers, fallback = { lat: 55.7558, lng: 37.6173 }) {
  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    return { lat: center.lat, lng: center.lng }
  }
  if (markers && markers.length === 1) {
    return { lat: markers[0].lat, lng: markers[0].lng }
  }
  const b = computeBounds(markers || [])
  if (b) return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 }
  return fallback
}

export function createProviderRegistry() {
  const adapters = new Map()
  let defaultId = 'osm'
  return {
    register(adapter) {
      if (!adapter?.id || typeof adapter.load !== 'function' || typeof adapter.createMap !== 'function') {
        throw new Error('Invalid MapProviderAdapter')
      }
      adapters.set(adapter.id, adapter)
    },
    get(id) {
      const key = (id || defaultId || 'osm').toLowerCase()
      const found = adapters.get(key) || adapters.get(defaultId) || adapters.get('osm')
      if (!found) throw new Error(`Map provider not registered: ${key}`)
      return found
    },
    list() { return [...adapters.values()] },
    setDefault(id) { defaultId = id },
  }
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
