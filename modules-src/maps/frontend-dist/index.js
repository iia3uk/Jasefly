/**
 * Jasefly Maps — Platform SDK frontend module (v1.0.2)
 * Provider adapters: Yandex (default, РФ) + optional OpenStreetMap/Leaflet.
 */
import {
  buildDirectionsUrl,
  openDirections,
  computeBounds,
  normalizeMarkers,
  resolveCenter,
  createProviderRegistry,
  escapeHtml,
  isLatLng,
} from './maps-core.js'

const SLUG = 'maps'
const VERSION = '1.0.2'
const API = '/api/v1'

export {
  buildDirectionsUrl,
  openDirections,
  computeBounds,
  normalizeMarkers,
  resolveCenter,
  createProviderRegistry,
  isLatLng,
}

// ─── Leaflet lazy loader ───────────────────────────────────────────

let leafletLoading = null

function loadCss(href) {
  if (typeof document === 'undefined') return
  const id = `jasefly-maps-css-${href}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('SSR: no document'))
      return
    }
    const id = `jasefly-maps-js-${src}`
    const existing = document.getElementById(id)
    if (existing) {
      if (window.L) { resolve(); return }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

export function moduleAssetBase() {
  if (typeof window === 'undefined') return '/modules/maps/assets'
  return `${window.location.origin}/modules/maps/assets`
}

export function loadLeaflet(assetBase) {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR: Leaflet unavailable'))
  if (window.L) return Promise.resolve(window.L)
  if (leafletLoading) return leafletLoading
  const base = String(assetBase || moduleAssetBase()).replace(/\/$/, '')
  loadCss(`${base}/leaflet.css`)
  leafletLoading = loadScript(`${base}/leaflet.js`).then(() => {
    const L = window.L
    if (!L) throw new Error('Leaflet global missing after load')
    if (L.Icon?.Default?.mergeOptions) {
      L.Icon.Default.mergeOptions({
        iconUrl: `${base}/images/marker-icon.png`,
        iconRetinaUrl: `${base}/images/marker-icon-2x.png`,
        shadowUrl: `${base}/images/marker-shadow.png`,
      })
    }
    return L
  })
  leafletLoading.catch(() => { leafletLoading = null })
  return leafletLoading
}

// ─── Default pin (SVG — no broken Leaflet PNG paths) ───────────────

function ensureMarkerCss() {
  if (typeof document === 'undefined') return
  if (document.getElementById('jasefly-maps-marker-css')) return
  const style = document.createElement('style')
  style.id = 'jasefly-maps-marker-css'
  style.textContent = `
    .jasefly-map-pin-wrap { background: transparent !important; border: 0 !important; }
    .jasefly-map-pin { width: 32px; height: 42px; filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
    .jasefly-map-pin svg { display: block; width: 32px; height: 42px; }
  `
  document.head.appendChild(style)
}

function defaultPinSvg(color = '#e11d48') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42" aria-hidden="true">
    <path fill="${color}" d="M16 0C7.7 0 1 6.7 1 15c0 10.5 13.2 25.4 13.8 26.1a1.5 1.5 0 0 0 2.4 0C17.8 40.4 31 25.5 31 15 31 6.7 24.3 0 16 0z"/>
    <circle fill="#fff" cx="16" cy="15" r="6"/>
  </svg>`
}

function leafletDefaultIcon(L) {
  ensureMarkerCss()
  return L.divIcon({
    className: 'jasefly-map-pin-wrap',
    html: `<div class="jasefly-map-pin">${defaultPinSvg()}</div>`,
    iconSize: [32, 42],
    iconAnchor: [16, 40],
    popupAnchor: [0, -36],
  })
}

// ─── Yandex Maps adapter (default for РФ; official map-widget) ─────

function createYandexAdapter() {
  return {
    id: 'yandex',
    label: 'Яндекс Карты',
    async load() {
      /* iframe widget — no SDK download required */
    },
    createMap(container, options) {
      const state = {
        center: { lat: options.center.lat, lng: options.center.lng },
        zoom: options.zoom || 15,
        markers: new Map(),
        listeners: {},
        interactive: !!options.interactive,
        scrollWheelZoom: !!options.scrollWheelZoom,
      }
      const wrap = document.createElement('div')
      wrap.style.cssText = 'position:relative;width:100%;height:100%;min-height:220px;'
      const iframe = document.createElement('iframe')
      iframe.title = 'Яндекс Карта'
      iframe.loading = 'lazy'
      iframe.setAttribute('allowfullscreen', 'true')
      iframe.referrerPolicy = 'origin'
      iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;'
      wrap.appendChild(iframe)
      container.innerHTML = ''
      container.appendChild(wrap)

      const emit = (event, ...args) => {
        const set = state.listeners[event]
        if (!set) return
        for (const fn of set) {
          try { fn(...args) } catch { /* */ }
        }
      }

      const rebuild = () => {
        const params = new URLSearchParams()
        // Yandex widget uses lng,lat
        params.set('ll', `${state.center.lng},${state.center.lat}`)
        params.set('z', String(Math.max(1, Math.min(21, state.zoom))))
        params.set('l', options.mapStyle === 'sat' ? 'sat,skl' : 'map')
        params.set('lang', (options.locale || 'ru').startsWith('en') ? 'en_US' : 'ru_RU')
        if (!state.interactive || !state.scrollWheelZoom) params.set('scroll', 'false')
        const pts = [...state.markers.values()].map((m) => `${m.lng},${m.lat},pm2rdm`)
        if (pts.length) params.set('pt', pts.join('~'))
        iframe.src = `https://yandex.ru/map-widget/v1/?${params.toString()}`
      }

      iframe.addEventListener('load', () => emit('ready'))
      rebuild()

      const approxBounds = () => {
        // rough viewport estimate for event parity
        const d = 180 / (2 ** state.zoom)
        return {
          south: state.center.lat - d * 0.35,
          north: state.center.lat + d * 0.35,
          west: state.center.lng - d * 0.55,
          east: state.center.lng + d * 0.55,
        }
      }

      const handle = {
        __yandex: { wrap, iframe, state },
        setView(center, zoom) {
          state.center = { lat: center.lat, lng: center.lng }
          if (zoom != null) state.zoom = zoom
          rebuild()
          emit('moveend', approxBounds())
        },
        setZoom(zoom) {
          state.zoom = zoom
          rebuild()
          emit('zoom', state.zoom)
        },
        fitBounds(bounds) {
          const midLat = (bounds.south + bounds.north) / 2
          const midLng = (bounds.west + bounds.east) / 2
          const latSpan = Math.max(0.0001, bounds.north - bounds.south)
          const lngSpan = Math.max(0.0001, bounds.east - bounds.west)
          const span = Math.max(latSpan, lngSpan)
          let z = 16
          if (span > 0.5) z = 9
          else if (span > 0.2) z = 11
          else if (span > 0.05) z = 13
          else if (span > 0.01) z = 15
          state.center = { lat: midLat, lng: midLng }
          state.zoom = z
          rebuild()
          emit('moveend', approxBounds())
        },
        addMarker(marker) {
          state.markers.set(marker.id, {
            id: marker.id,
            lat: marker.lat,
            lng: marker.lng,
            title: marker.title,
            description: marker.description,
            onClick: marker.onClick,
          })
          rebuild()
        },
        removeMarker(id) {
          state.markers.delete(id)
          rebuild()
        },
        clearMarkers() {
          state.markers.clear()
          rebuild()
        },
        openPopup() { /* widget balloons are limited without JS API key */ },
        getBounds() { return approxBounds() },
        getZoom() { return state.zoom },
        getCenter() { return { ...state.center } },
        on(event, handler) {
          if (!state.listeners[event]) state.listeners[event] = new Set()
          state.listeners[event].add(handler)
        },
        off(event, handler) { state.listeners[event]?.delete(handler) },
      }
      return handle
    },
    destroy(handle) {
      const bag = handle?.__yandex
      if (!bag) return
      try { bag.wrap.remove() } catch { /* */ }
      for (const key of Object.keys(bag.state.listeners)) bag.state.listeners[key]?.clear()
      bag.state.markers.clear()
    },
  }
}

// ─── OSM / Leaflet adapter (optional; SVG markers, no Leaflet flag prefix) ─

function createOsmAdapter() {
  return {
    id: 'osm',
    label: 'OpenStreetMap',
    async load(assetBase) {
      await loadLeaflet(assetBase)
    },
    createMap(container, options) {
      const L = window.L
      if (!L) throw new Error('Leaflet not loaded')
      ensureMarkerCss()
      const map = L.map(container, {
        center: [options.center.lat, options.center.lng],
        zoom: options.zoom,
        zoomControl: false,
        // Disable default prefix (includes political flag in recent Leaflet)
        attributionControl: false,
        dragging: options.interactive && options.dragging,
        scrollWheelZoom: options.interactive && options.scrollWheelZoom,
        doubleClickZoom: options.interactive,
        boxZoom: options.interactive,
        keyboard: options.interactive,
        touchZoom: options.interactive,
      })
      L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map)
      const tileUrl = options.mapStyle === 'hot'
        ? 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)

      const listeners = {}
      const markers = new Map()
      const cleanups = []
      const emit = (event, ...args) => {
        const set = listeners[event]
        if (!set) return
        for (const fn of set) {
          try { fn(...args) } catch { /* */ }
        }
      }
      const toBounds = () => {
        const b = map.getBounds()
        const sw = b.getSouthWest()
        const ne = b.getNorthEast()
        return { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }
      }
      const onClick = (e) => emit('click', { lat: e.latlng.lat, lng: e.latlng.lng })
      const onZoom = () => emit('zoom', map.getZoom())
      const onMoveEnd = () => emit('moveend', toBounds())
      map.on('click', onClick)
      map.on('zoomend', onZoom)
      map.on('moveend', onMoveEnd)
      cleanups.push(() => {
        map.off('click', onClick)
        map.off('zoomend', onZoom)
        map.off('moveend', onMoveEnd)
      })

      const handle = {
        __leaflet: { map, markers, listeners, cleanups },
        setView(center, zoom) { map.setView([center.lat, center.lng], zoom ?? map.getZoom()) },
        setZoom(zoom) { map.setZoom(zoom) },
        fitBounds(bounds, padding = 32) {
          map.fitBounds(
            L.latLngBounds(L.latLng(bounds.south, bounds.west), L.latLng(bounds.north, bounds.east)),
            { padding: [padding, padding] },
          )
        },
        addMarker(marker) {
          this.removeMarker(marker.id)
          let icon
          if (marker.iconUrl) {
            const size = marker.iconSize || [32, 32]
            icon = L.icon({
              iconUrl: marker.iconUrl,
              iconSize: size,
              iconAnchor: [size[0] / 2, size[1]],
              popupAnchor: [0, -Math.round(size[1] * 0.875)],
            })
          } else {
            icon = leafletDefaultIcon(L)
          }
          const m = L.marker([marker.lat, marker.lng], { icon })
          const html = [
            marker.title ? `<strong>${escapeHtml(marker.title)}</strong>` : '',
            marker.description ? `<div>${escapeHtml(marker.description)}</div>` : '',
          ].filter(Boolean).join('')
          if (html) m.bindPopup(html)
          m.on('click', () => { if (typeof marker.onClick === 'function') marker.onClick(marker) })
          m.addTo(map)
          markers.set(marker.id, m)
        },
        removeMarker(id) {
          const m = markers.get(id)
          if (m) { map.removeLayer(m); markers.delete(id) }
        },
        clearMarkers() { for (const id of [...markers.keys()]) this.removeMarker(id) },
        openPopup(id) { markers.get(id)?.openPopup() },
        getBounds() { return toBounds() },
        getZoom() { return map.getZoom() },
        getCenter() {
          const c = map.getCenter()
          return { lat: c.lat, lng: c.lng }
        },
        on(event, handler) {
          if (!listeners[event]) listeners[event] = new Set()
          listeners[event].add(handler)
        },
        off(event, handler) { listeners[event]?.delete(handler) },
      }
      requestAnimationFrame(() => { try { map.invalidateSize() } catch { /* */ } })
      return handle
    },
    destroy(handle) {
      const bag = handle?.__leaflet
      if (!bag) return
      for (const fn of bag.cleanups) { try { fn() } catch { /* */ } }
      bag.cleanups.length = 0
      for (const m of bag.markers.values()) { try { bag.map.removeLayer(m) } catch { /* */ } }
      bag.markers.clear()
      for (const key of Object.keys(bag.listeners)) bag.listeners[key]?.clear()
      try { bag.map.remove() } catch { /* */ }
    },
  }
}

export const defaultRegistry = createProviderRegistry()
defaultRegistry.register(createYandexAdapter())
defaultRegistry.register(createOsmAdapter())
defaultRegistry.setDefault('yandex')

// ─── UI helpers ────────────────────────────────────────────────────

const mapChrome = {
  wrap: {
    position: 'relative',
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,.12)',
    background: 'rgba(9,9,11,.55)',
  },
  canvas: { width: '100%', height: '100%', minHeight: 220 },
  controls: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 500,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: '1px solid rgba(63,63,70,.9)',
    background: 'rgba(24,24,27,.92)',
    color: '#fafafa',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directions: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    zIndex: 500,
  },
  directionsLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(56,189,248,.35)',
    background: 'rgba(3,105,161,.9)',
    color: '#e0f2fe',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
  },
  fallback: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: 20,
    minHeight: 220,
    height: '100%',
    boxSizing: 'border-box',
    color: '#e4e4e7',
  },
  fallbackTitle: { margin: 0, fontSize: 16, fontWeight: 650, color: '#fafafa' },
  fallbackHint: { margin: 0, fontSize: 13, lineHeight: 1.5, color: '#a1a1aa' },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
}

function authHeaders(extra = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'same-origin',
    ...opts,
    headers: authHeaders(opts.headers || {}),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* */ }
  if (!res.ok) throw new Error(json?.error || json?.message || text || res.statusText)
  return json?.data ?? json
}

function heightStyle(height) {
  if (height == null || height === '') return 320
  if (typeof height === 'number') return height
  return height
}

function directionsTargetFromProps(props, markers) {
  if (props.directions?.target) return props.directions.target
  if (props.address) return props.address
  if (markers?.[0]) return { lat: markers[0].lat, lng: markers[0].lng, address: markers[0].description || markers[0].title }
  if (props.center) return props.center
  return null
}

// ─── createMapsApi ─────────────────────────────────────────────────

export function createMapsApi(ui, options = {}) {
  const { createElement: h, useState, useEffect, Fragment } = ui
  const registry = options.registry || defaultRegistry
  const assetBase = options.assetBase || moduleAssetBase()

  function MapFallback({ title, hint, address, directionsUrl, height }) {
    return h('div', {
      role: 'region',
      'aria-label': title || 'Карта недоступна',
      style: { ...mapChrome.fallback, minHeight: heightStyle(height) },
    },
      h('p', { style: mapChrome.fallbackTitle }, title || 'Карта недоступна'),
      h('p', { style: mapChrome.fallbackHint }, hint || 'Не удалось загрузить карту.'),
      address ? h('p', { style: { margin: 0, fontSize: 14, color: '#d4d4d8' } }, address) : null,
      directionsUrl
        ? h('a', {
          href: directionsUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: mapChrome.directionsLink,
        }, 'Построить маршрут')
        : null,
    )
  }

  function MapControls({ onZoomIn, onZoomOut, onReset, showReset, interactive }) {
    if (!interactive) return null
    return h('div', { style: mapChrome.controls, role: 'group', 'aria-label': 'Управление картой' },
      h('button', { type: 'button', style: mapChrome.btn, 'aria-label': 'Увеличить', onClick: onZoomIn }, '+'),
      h('button', { type: 'button', style: mapChrome.btn, 'aria-label': 'Уменьшить', onClick: onZoomOut }, '−'),
      showReset
        ? h('button', { type: 'button', style: mapChrome.btn, 'aria-label': 'Вернуть исходное положение', onClick: onReset }, '↺')
        : null,
    )
  }

  function Marker() {
    // Declarative markers are passed via Map.markers[]; child Marker is a no-op stub for API parity.
    return null
  }

  function Popup({ children }) {
    return children || null
  }

  function Map(props) {
    const {
      center,
      zoom = 15,
      markers: markersProp,
      height = 320,
      className,
      interactive = true,
      scrollWheelZoom = true,
      dragging = true,
      fitBounds = false,
      showReset = true,
      showZoomControls,
      provider = 'yandex',
      apiKey,
      mapStyle,
      locale,
      address,
      ariaLabel,
      showDirectionsLink = true,
      directions,
      forceError = false,
      onMapClick,
      onMarkerClick,
      onBoundsChange,
      onZoomChange,
      onReady,
      onError,
    } = props || {}

    const markers = normalizeMarkers(markersProp)
    const resolvedCenter = resolveCenter(center, markers)
    const initialZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 15
    const dirTarget = directionsTargetFromProps({ directions, address, center }, markers)
    const dirService = directions?.service || (provider === 'google' ? 'google' : provider === 'osm' ? 'osm' : 'yandex')
    const directionsUrl = dirTarget ? buildDirectionsUrl(dirTarget, dirService) : null
    // Yandex/Google already ship native zoom UI — our overlay duplicates them
    const nativeProviderUi = provider === 'yandex' || provider === 'google'
    const controlsVisible = showZoomControls != null ? !!showZoomControls : !nativeProviderUi

    const [phase, setPhase] = useState(
      typeof window === 'undefined' || forceError ? 'fallback' : 'loading',
    )
    const [errorMsg, setErrorMsg] = useState(forceError ? 'Forced error (demo)' : '')
    const [containerEl, setContainerEl] = useState(null)
    const refs = useState(() => ({
      handle: null,
      initial: { center: resolvedCenter, zoom: initialZoom },
      clickFn: null,
      zoomFn: null,
      moveFn: null,
    }))[0]

    useEffect(() => {
      if (typeof window === 'undefined' || forceError) {
        setPhase('fallback')
        if (forceError) {
          const err = new Error('Forced map error')
          setErrorMsg(err.message)
          onError?.(err)
        }
        return undefined
      }
      if (!containerEl) return undefined

      let cancelled = false
      const adapter = registry.get(provider)
      setPhase('loading')

      const clickFn = (ll) => onMapClick?.(ll)
      const zoomFn = (z) => onZoomChange?.(z)
      const moveFn = (b) => onBoundsChange?.(b)
      refs.clickFn = clickFn
      refs.zoomFn = zoomFn
      refs.moveFn = moveFn

      ;(async () => {
        try {
          await adapter.load(assetBase)
          if (cancelled || !containerEl) return
          if (refs.handle) {
            try { adapter.destroy(refs.handle) } catch { /* */ }
            refs.handle = null
          }
          const handle = adapter.createMap(containerEl, {
            center: resolvedCenter,
            zoom: initialZoom,
            interactive: !!interactive,
            scrollWheelZoom: interactive !== false && scrollWheelZoom !== false,
            dragging: interactive !== false && dragging !== false,
            mapStyle,
            apiKey,
            locale,
            assetBase,
          })
          refs.handle = handle
          refs.initial = { center: resolvedCenter, zoom: initialZoom }

          handle.on('click', clickFn)
          handle.on('zoom', zoomFn)
          handle.on('moveend', moveFn)

          handle.clearMarkers()
          for (const m of markers) {
            handle.addMarker({
              ...m,
              onClick: (marker) => {
                onMarkerClick?.(marker)
                m.onClick?.(marker)
              },
            })
          }
          if (fitBounds && markers.length > 0) {
            const b = computeBounds(markers)
            if (b) handle.fitBounds(b)
          } else if (markers.length === 1 && !center) {
            handle.setView({ lat: markers[0].lat, lng: markers[0].lng }, initialZoom)
          }

          if (!cancelled) {
            setPhase('ready')
            onReady?.()
          }
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e))
          if (!cancelled) {
            setErrorMsg(err.message)
            setPhase('fallback')
            onError?.(err)
          }
        }
      })()

      return () => {
        cancelled = true
        const adapter2 = registry.get(provider)
        if (refs.handle) {
          try {
            if (refs.clickFn) refs.handle.off('click', refs.clickFn)
            if (refs.zoomFn) refs.handle.off('zoom', refs.zoomFn)
            if (refs.moveFn) refs.handle.off('moveend', refs.moveFn)
          } catch { /* */ }
          try { adapter2.destroy(refs.handle) } catch { /* */ }
          refs.handle = null
        }
      }
    }, [
      containerEl,
      provider,
      resolvedCenter.lat,
      resolvedCenter.lng,
      initialZoom,
      interactive,
      scrollWheelZoom,
      dragging,
      fitBounds,
      mapStyle,
      forceError,
      JSON.stringify(markers.map((m) => [m.id, m.lat, m.lng, m.title, m.description, m.iconUrl])),
    ])

    const setContainer = (el) => {
      setContainerEl((prev) => (prev === el ? prev : el))
    }

    const onZoomIn = () => {
      const hnd = refs.handle
      if (!hnd) return
      hnd.setZoom(hnd.getZoom() + 1)
    }
    const onZoomOut = () => {
      const hnd = refs.handle
      if (!hnd) return
      hnd.setZoom(hnd.getZoom() - 1)
    }
    const onReset = () => {
      const hnd = refs.handle
      if (!hnd) return
      if (fitBounds && markers.length > 0) {
        const b = computeBounds(markers)
        if (b) hnd.fitBounds(b)
        else hnd.setView(refs.initial.center, refs.initial.zoom)
      } else {
        hnd.setView(refs.initial.center, refs.initial.zoom)
      }
    }

    const hStyle = heightStyle(height)
    const label = ariaLabel || address || (markers[0]?.title ? `Карта: ${markers[0].title}` : 'Интерактивная карта')

    if (phase === 'fallback') {
      return h('div', { className, style: { ...mapChrome.wrap, height: hStyle } },
        h(MapFallback, {
          title: 'Карта недоступна',
          hint: errorMsg || 'Не удалось загрузить карту. Откройте маршрут во внешнем сервисе.',
          address,
          directionsUrl: showDirectionsLink ? directionsUrl : null,
          height: hStyle,
        }),
      )
    }

    return h('div', {
      className,
      style: { ...mapChrome.wrap, height: hStyle },
      role: 'region',
      'aria-label': label,
    },
      h('span', { style: mapChrome.srOnly }, address || label),
      h('div', {
        ref: setContainer,
        style: mapChrome.canvas,
        'aria-hidden': interactive === false ? 'true' : 'false',
      }),
      phase === 'loading'
        ? h('div', {
          style: {
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#a1a1aa', fontSize: 13, pointerEvents: 'none',
          },
        }, 'Загрузка карты…')
        : null,
      controlsVisible
        ? h(MapControls, {
          interactive: interactive !== false,
          showReset: showReset !== false,
          onZoomIn,
          onZoomOut,
          onReset,
        })
        : null,
      showDirectionsLink && directionsUrl
        ? h('div', { style: mapChrome.directions },
          h('a', {
            href: directionsUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            style: mapChrome.directionsLink,
            'aria-label': 'Построить маршрут во внешнем картографическом сервисе',
          }, 'Построить маршрут'),
        )
        : null,
    )
  }

  return { Map, Marker, Popup, MapFallback, MapControls, openDirections, buildDirectionsUrl }
}

// ─── Widget settings helpers ───────────────────────────────────────

function parseMarkersSetting(settings) {
  if (Array.isArray(settings.markers)) return normalizeMarkers(settings.markers)
  if (typeof settings.markers_json === 'string' && settings.markers_json.trim()) {
    try {
      return normalizeMarkers(JSON.parse(settings.markers_json))
    } catch { /* */ }
  }
  const lat = Number(settings.marker_lat ?? settings.lat ?? settings.center_lat)
  const lng = Number(settings.marker_lng ?? settings.lng ?? settings.center_lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return normalizeMarkers([{
      id: settings.marker_id || 'point',
      lat,
      lng,
      title: settings.marker_title || settings.title || '',
      description: settings.marker_description || settings.address || '',
      iconUrl: settings.marker_icon_url || settings.icon_url || undefined,
    }])
  }
  return []
}

function createMapWidget(ui) {
  const { Map } = createMapsApi(ui)
  return function MapWidget({ settings = {}, editMode }) {
    const { createElement: h } = ui
    const markers = parseMarkersSetting(settings)
    const centerLat = Number(settings.center_lat)
    const centerLng = Number(settings.center_lng)
    const center = Number.isFinite(centerLat) && Number.isFinite(centerLng)
      ? { lat: centerLat, lng: centerLng }
      : undefined
    const zoom = Number(settings.zoom)
    return h('div', { style: { width: '100%' } },
      settings.title
        ? h('h3', { style: { margin: '0 0 10px', fontSize: 18, fontWeight: 650 } }, String(settings.title))
        : null,
      h(Map, {
        center,
        zoom: Number.isFinite(zoom) ? zoom : 15,
        markers,
        height: settings.height || 360,
        address: settings.address || '',
        interactive: settings.interactive !== false && settings.interactive !== 0 && settings.interactive !== '0',
        scrollWheelZoom: settings.scroll_wheel_zoom !== false && settings.scroll_wheel_zoom !== 0 && settings.scroll_wheel_zoom !== '0',
        fitBounds: !!settings.fit_bounds,
        showDirectionsLink: settings.show_directions !== false && settings.show_directions !== 0 && settings.show_directions !== '0',
        provider: settings.provider || 'yandex',
        mapStyle: settings.map_style || 'default',
        // Overlay +/- only for OSM; Yandex has its own controls
        showZoomControls: (settings.provider || 'yandex') === 'osm'
          && (!editMode || settings.show_controls !== false),
        directions: {
          target: settings.address
            || (Number.isFinite(Number(settings.center_lat)) && Number.isFinite(Number(settings.center_lng))
              ? { lat: Number(settings.center_lat), lng: Number(settings.center_lng) }
              : markers[0]),
          service: (settings.provider || 'yandex') === 'osm' ? 'osm' : 'yandex',
        },
      }),
    )
  }
}

// ─── Admin page ────────────────────────────────────────────────────

function createAdminPage(ui) {
  const { createElement: h, useState, useEffect } = ui
  return function AdminPage() {
    const [settings, setSettings] = useState(null)
    const [error, setError] = useState('')
    const [msg, setMsg] = useState('')
    const [busy, setBusy] = useState(false)

    const reload = () => apiFetch('/admin/maps/settings')
      .then((s) => { setSettings(s || {}); setError('') })
      .catch((e) => setError(e.message))

    useEffect(() => { reload() }, [])

    const set = (k, v) => setSettings((prev) => ({ ...(prev || {}), [k]: v }))

    const save = async () => {
      if (!settings) return
      setBusy(true)
      setMsg('')
      setError('')
      try {
        const saved = await apiFetch('/admin/maps/settings', {
          method: 'PUT',
          body: JSON.stringify(settings),
        })
        setSettings(saved)
        setMsg('Сохранено')
      } catch (e) {
        setError(e.message)
      } finally {
        setBusy(false)
      }
    }

    if (!settings) {
      return h('div', { style: { padding: 24, color: '#a1a1aa' } }, error || 'Загрузка…')
    }

    const field = (label, key, type = 'text', hint) => h('label', {
      style: { display: 'grid', gap: 6, marginBottom: 14, fontSize: 13, color: '#a1a1aa' },
    },
      label,
      type === 'select'
        ? h('select', {
          value: settings[key] || 'yandex',
          onChange: (e) => set(key, e.target.value),
          style: inputStyle,
        },
          h('option', { value: 'yandex' }, 'Яндекс Карты (рекомендуется для РФ)'),
          h('option', { value: 'osm' }, 'OpenStreetMap (Leaflet)'),
          h('option', { value: 'google', disabled: true }, 'Google Maps (скоро)'),
          h('option', { value: 'mapbox', disabled: true }, 'Mapbox (скоро)'),
        )
        : h('input', {
          type,
          value: settings[key] ?? '',
          onChange: (e) => set(key, type === 'number' ? Number(e.target.value) : e.target.value),
          style: inputStyle,
        }),
      hint ? h('span', { style: { color: '#71717a', fontSize: 12 } }, hint) : null,
    )

    return h('div', { style: { maxWidth: 720, color: '#e4e4e7', paddingBottom: 40 } },
      h('p', { style: { margin: 0, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#38bdf8' } }, 'Модуль'),
      h('h1', { style: { margin: '6px 0 8px', fontSize: 26, fontWeight: 650, color: '#fafafa' } }, 'Карты'),
      h('p', { style: { margin: '0 0 18px', fontSize: 14, lineHeight: 1.55, color: '#a1a1aa' } },
        'Универсальный модуль карт. По умолчанию — Яндекс Карты (виджет). OSM/Leaflet оставлен как опция. Виджет: maps.map · Демо: /maps-demo.'),
      h('div', {
        style: {
          border: '1px solid #27272a', borderRadius: 16, background: 'rgba(24,24,27,.55)',
          padding: 18, marginBottom: 14,
        },
      },
        field('Провайдер', 'provider', 'select', 'Для РФ используйте Яндекс. OSM — запасной вариант.'),
        field('API-ключ (опционально)', 'api_key', 'text', 'Для Яндекс-виджета не нужен. Не отдаётся в публичный /maps/config.'),
        field('Локаль', 'locale', 'text'),
        field('Стиль карты', 'map_style', 'text', 'yandex: default|sat · osm: default|hot'),
        field('Широта по умолчанию', 'default_lat', 'number'),
        field('Долгота по умолчанию', 'default_lng', 'number'),
        field('Zoom по умолчанию', 'default_zoom', 'number'),
        field('Fallback: заголовок', 'fallback_title', 'text'),
        field('Fallback: подсказка', 'fallback_hint', 'text'),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
          h('button', {
            type: 'button',
            disabled: busy,
            onClick: save,
            style: {
              padding: '9px 14px', borderRadius: 10, border: 'pointer', font: 'inherit', fontSize: 13,
              border: '1px solid rgba(56,189,248,.4)', background: '#0369a1', color: '#e0f2fe',
            },
          }, busy ? 'Сохранение…' : 'Сохранить'),
          h('a', { href: '/maps-demo', style: { color: '#7dd3fc', fontSize: 13 } }, 'Открыть демо'),
          msg ? h('span', { style: { color: '#6ee7b7', fontSize: 13 } }, msg) : null,
          error ? h('span', { style: { color: '#fca5a5', fontSize: 13 } }, error) : null,
        ),
      ),
    )
  }
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
  border: '1px solid #3f3f46', background: '#09090b', color: '#fafafa', font: 'inherit',
}

// ─── Demo page ─────────────────────────────────────────────────────

function createDemoPage(ui) {
  const { createElement: h, useState, useEffect, Fragment } = ui
  const api = createMapsApi(ui)
  const { Map } = api

  return function DemoPage() {
    const [forceError, setForceError] = useState(false)
    const [lastEvent, setLastEvent] = useState('')

    useEffect(() => {
      if (typeof window === 'undefined') return
      const q = new URLSearchParams(window.location.search)
      if (q.get('maps_force_error') === '1') setForceError(true)
    }, [])

    const section = (title, body, child) => h('section', {
      style: {
        marginBottom: 28,
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 16,
        padding: 18,
        background: 'rgba(18,18,24,.55)',
      },
    },
      h('h2', { style: { margin: '0 0 6px', fontSize: 18, color: '#fafafa' } }, title),
      body ? h('p', { style: { margin: '0 0 12px', color: '#a1a1aa', fontSize: 14, lineHeight: 1.5 } }, body) : null,
      child,
    )

    return h('div', {
      style: { maxWidth: 960, margin: '0 auto', padding: '32px 16px 64px', color: '#e4e4e7' },
      'data-translate-root': '1',
    },
      h('p', { style: { margin: 0, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: '#38bdf8' } }, 'Jasefly Maps'),
      h('h1', { style: { margin: '8px 0', fontSize: 30, fontWeight: 700, color: '#fafafa' } }, 'Демонстрация модуля карт'),
      h('p', { style: { margin: '0 0 8px', color: '#a1a1aa', maxWidth: 640, lineHeight: 1.55 } },
        'Провайдер OpenStreetMap через адаптер. Публичный API компонента стабилен для Google / Яндекс / Mapbox.'),
      lastEvent
        ? h('p', { style: { margin: '0 0 18px', fontSize: 13, color: '#7dd3fc' } }, `Событие: ${lastEvent}`)
        : h('p', { style: { margin: '0 0 18px', fontSize: 13, color: '#71717a' } }, 'Кликните по карте или маркеру.'),

      section('Одна точка', 'Минимальный сценарий для контактов / клиники.',
        h(Map, {
          provider: 'yandex',
          center: { lat: 55.7539, lng: 37.6208 },
          zoom: 16,
          address: 'Красная площадь, Москва',
          markers: [{
            id: 'clinic',
            lat: 55.7539,
            lng: 37.6208,
            title: 'Красная площадь',
            description: 'Москва — пример точки на Яндекс Картах',
          }],
          onMapClick: (ll) => setLastEvent(`mapClick ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`),
          onMarkerClick: (m) => setLastEvent(`markerClick ${m.id}`),
          onReady: () => setLastEvent((prev) => prev || 'ready'),
        }),
      ),

      section('Несколько точек', 'Автоматическое масштабирование по всем маркерам (fitBounds).',
        h(Map, {
          provider: 'yandex',
          fitBounds: true,
          height: 360,
          markers: [
            { id: 'a', lat: 55.7539, lng: 37.6208, title: 'Красная площадь' },
            { id: 'b', lat: 55.76, lng: 37.64, title: 'Точка B' },
            { id: 'c', lat: 55.74, lng: 37.60, title: 'Точка C' },
          ],
          onBoundsChange: () => setLastEvent('boundsChange'),
          onZoomChange: (z) => setLastEvent(`zoom ${z}`),
        }),
      ),

      section('Пользовательский маркер (OSM)', 'Своя иконка через iconUrl — адаптер OpenStreetMap.',
        h(Map, {
          provider: 'osm',
          center: { lat: 55.7539, lng: 37.6208 },
          zoom: 15,
          markers: [{
            id: 'custom',
            lat: 55.7539,
            lng: 37.6208,
            title: 'SVG / custom pin',
            description: 'По умолчанию SVG-пин; iconUrl — кастом',
            iconUrl: `${moduleAssetBase()}/images/marker-icon.png`,
            iconSize: [25, 41],
          }],
        }),
      ),

      section('Маршрут во внешнем сервисе', 'Кнопка «Построить маршрут» открывает OSM / Google / Yandex.',
        h(Fragment, null,
          h(Map, {
            center: { lat: 55.7558, lng: 37.6173 },
            zoom: 14,
            address: 'Красная площадь, Москва',
            showDirectionsLink: true,
            provider: 'yandex',
            directions: { target: { lat: 55.7539, lng: 37.6208, address: 'Красная площадь' }, service: 'yandex' },
            markers: [{ id: 'kremlin', lat: 55.7539, lng: 37.6208, title: 'Красная площадь' }],
            height: 280,
          }),
          h('p', { style: { marginTop: 10, fontSize: 13, color: '#a1a1aa' } },
            'Маршрут в Яндекс: ',
            h('a', {
              href: buildDirectionsUrl({ lat: 55.7539, lng: 37.6208 }, 'yandex'),
              target: '_blank',
              rel: 'noopener noreferrer',
              style: { color: '#7dd3fc' },
            }, 'открыть'),
          ),
        ),
      ),

      section('Fallback при ошибке', 'Карта не ломает страницу — адрес и кнопка маршрута остаются.',
        h(Fragment, null,
          h('label', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 13 } },
            h('input', {
              type: 'checkbox',
              checked: forceError,
              onChange: (e) => setForceError(!!e.target.checked),
            }),
            'Принудительная ошибка (или ?maps_force_error=1)',
          ),
          h(Map, {
            forceError,
            address: 'г. Москва, ул. Примерная, д. 123',
            center: { lat: 55.7558, lng: 37.6173 },
            markers: [{ id: 'x', lat: 55.7558, lng: 37.6173, title: 'Клиника' }],
            showDirectionsLink: true,
            onError: (err) => setLastEvent(`error: ${err.message}`),
            height: 260,
          }),
        ),
      ),
    )
  }
}

// ─── Module registration ───────────────────────────────────────────

export const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,

  async register(ctx) {
    const ui = ctx.ui
    if (!ui?.createElement) {
      console.warn('[maps] ctx.ui missing')
      return
    }

    const MapWidget = createMapWidget(ui)
    const AdminPage = createAdminPage(ui)
    const DemoPage = createDemoPage(ui)

    if (ctx.builder?.registerWidget) {
      ctx.builder.registerWidget({
        type: 'map',
        label: 'Карта',
        category: 'integration',
        icon: 'map',
        defaultSettings: {
          title: '',
          center_lat: 55.7558,
          center_lng: 37.6173,
          zoom: 15,
          address: '',
          marker_title: 'Метка',
          marker_description: '',
          height: 360,
          fit_bounds: false,
          interactive: true,
          scroll_wheel_zoom: true,
          show_directions: true,
          provider: 'yandex',
          map_style: 'default',
          markers_json: '',
        },
        settingsFields: [
          { key: 'title', label: 'Заголовок', type: 'text' },
          { key: 'address', label: 'Адрес (a11y / fallback)', type: 'text' },
          { key: 'center_lat', label: 'Широта центра', type: 'number' },
          { key: 'center_lng', label: 'Долгота центра', type: 'number' },
          { key: 'zoom', label: 'Масштаб', type: 'number' },
          { key: 'marker_title', label: 'Маркер: заголовок', type: 'text' },
          { key: 'marker_description', label: 'Маркер: описание', type: 'text' },
          { key: 'marker_icon_url', label: 'Маркер: URL иконки', type: 'url' },
          { key: 'markers_json', label: 'Маркеры (JSON массив)', type: 'code' },
          { key: 'height', label: 'Высота (px)', type: 'number' },
          { key: 'fit_bounds', label: 'Вписать все маркеры', type: 'toggle' },
          { key: 'interactive', label: 'Интерактивность', type: 'toggle' },
          { key: 'scroll_wheel_zoom', label: 'Zoom колёсиком', type: 'toggle' },
          { key: 'show_directions', label: 'Кнопка «Построить маршрут»', type: 'toggle' },
          {
            key: 'provider',
            label: 'Провайдер',
            type: 'select',
            options: [
              { value: 'yandex', label: 'Яндекс Карты' },
              { value: 'osm', label: 'OpenStreetMap' },
            ],
          },
          {
            key: 'map_style',
            label: 'Стиль',
            type: 'select',
            options: [
              { value: 'default', label: 'Схема' },
              { value: 'sat', label: 'Спутник (Яндекс)' },
              { value: 'hot', label: 'OSM Humanitarian' },
            ],
          },
        ],
        Render: MapWidget,
      })
    }

    const nav = {
      group: 'Контент',
      path: '/admin/maps',
      label: 'Карты',
      permission: 'maps.view',
      icon: 'map',
    }
    const page = {
      path: 'maps',
      label: 'Карты',
      group: 'Контент',
      permission: 'maps.view',
      Component: AdminPage,
    }
    if (ctx.admin?.registerNavItem) {
      ctx.admin.registerNavItem(nav)
      ctx.admin.registerPage?.(page)
    } else {
      ctx.registerAdminNavItem?.(nav)
      ctx.registerAdminRoute?.(page)
    }

    if (ctx.public?.registerRoute) {
      ctx.public.registerRoute({
        path: '/maps-demo',
        label: 'Maps demo',
        lazy: async () => ({ default: DemoPage }),
      })
    }
  },

  async unregister() {
    // Host unregisters routes/widgets via platform registry
  },
}

export default JaseflyFrontendModule
