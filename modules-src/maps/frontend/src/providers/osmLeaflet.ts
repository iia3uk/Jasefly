import type { LatLng, MapBounds, MapEventMap, MapHandle, MapInitOptions, MapMarker, MapProviderAdapter } from '../types'
import { loadLeaflet } from '../utils/loadLeaflet'

type ListenerBag = {
  [K in keyof MapEventMap]?: Set<MapEventMap[K]>
}

type InternalHandle = MapHandle & {
  __leaflet: {
    map: import('leaflet').Map
    markers: Map<string, import('leaflet').Marker>
    listeners: ListenerBag
    cleanups: Array<() => void>
  }
}

function emit<K extends keyof MapEventMap>(bag: ListenerBag, event: K, ...args: Parameters<MapEventMap[K]>): void {
  const set = bag[event]
  if (!set) return
  for (const fn of set) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(fn as any)(...args)
    } catch {
      /* ignore listener errors */
    }
  }
}

function leafletBounds(L: typeof import('leaflet'), b: MapBounds) {
  return L.latLngBounds(L.latLng(b.south, b.west), L.latLng(b.north, b.east))
}

function toBounds(map: import('leaflet').Map): MapBounds {
  const b = map.getBounds()
  const sw = b.getSouthWest()
  const ne = b.getNorthEast()
  return { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }
}

export const osmLeafletAdapter: MapProviderAdapter = {
  id: 'osm',
  label: 'OpenStreetMap',

  async load(assetBase: string) {
    await loadLeaflet(assetBase)
  },

  createMap(container: HTMLElement, options: MapInitOptions): MapHandle {
    const L = window.L as unknown as typeof import('leaflet')
    if (!L) throw new Error('Leaflet not loaded')

    const map = L.map(container, {
      center: [options.center.lat, options.center.lng],
      zoom: options.zoom,
      zoomControl: false,
      attributionControl: true,
      dragging: options.interactive && options.dragging,
      scrollWheelZoom: options.interactive && options.scrollWheelZoom,
      doubleClickZoom: options.interactive,
      boxZoom: options.interactive,
      keyboard: options.interactive,
      touchZoom: options.interactive,
    })

    const tileUrl =
      options.mapStyle === 'hot'
        ? 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    const listeners: ListenerBag = {}
    const markers = new Map<string, import('leaflet').Marker>()
    const cleanups: Array<() => void> = []

    const onClick = (e: import('leaflet').LeafletMouseEvent) => {
      emit(listeners, 'click', { lat: e.latlng.lat, lng: e.latlng.lng })
    }
    const onZoom = () => emit(listeners, 'zoom', map.getZoom())
    const onMoveEnd = () => emit(listeners, 'moveend', toBounds(map))

    map.on('click', onClick)
    map.on('zoomend', onZoom)
    map.on('moveend', onMoveEnd)
    cleanups.push(() => {
      map.off('click', onClick)
      map.off('zoomend', onZoom)
      map.off('moveend', onMoveEnd)
    })

    const handle: InternalHandle = {
      __leaflet: { map, markers, listeners, cleanups },
      setView(center: LatLng, zoom?: number) {
        map.setView([center.lat, center.lng], zoom ?? map.getZoom())
      },
      setZoom(zoom: number) {
        map.setZoom(zoom)
      },
      fitBounds(bounds: MapBounds, padding = 32) {
        map.fitBounds(leafletBounds(L, bounds), { padding: [padding, padding] })
      },
      addMarker(marker: MapMarker) {
        this.removeMarker(marker.id)
        const icon =
          marker.iconUrl &&
          L.icon({
            iconUrl: marker.iconUrl,
            iconSize: marker.iconSize || [32, 32],
            iconAnchor: marker.iconSize
              ? [marker.iconSize[0] / 2, marker.iconSize[1]]
              : [16, 32],
            popupAnchor: [0, -28],
          })
        const m = L.marker([marker.lat, marker.lng], icon ? { icon } : undefined)
        const html = [
          marker.title ? `<strong>${escapeHtml(marker.title)}</strong>` : '',
          marker.description ? `<div>${escapeHtml(marker.description)}</div>` : '',
        ]
          .filter(Boolean)
          .join('')
        if (html) m.bindPopup(html)
        m.on('click', () => {
          marker.onClick?.(marker)
        })
        m.addTo(map)
        markers.set(marker.id, m)
      },
      removeMarker(id: string) {
        const m = markers.get(id)
        if (m) {
          map.removeLayer(m)
          markers.delete(id)
        }
      },
      clearMarkers() {
        for (const id of [...markers.keys()]) this.removeMarker(id)
      },
      openPopup(id: string) {
        markers.get(id)?.openPopup()
      },
      getBounds() {
        return toBounds(map)
      },
      getZoom() {
        return map.getZoom()
      },
      getCenter() {
        const c = map.getCenter()
        return { lat: c.lat, lng: c.lng }
      },
      on(event, handler) {
        if (!listeners[event]) listeners[event] = new Set()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(listeners[event] as Set<any>).add(handler)
      },
      off(event, handler) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(listeners[event] as Set<any> | undefined)?.delete(handler)
      },
    }

    // Invalidate size after layout (common Leaflet issue in flex/grid)
    requestAnimationFrame(() => {
      try {
        map.invalidateSize()
      } catch {
        /* */
      }
    })

    return handle
  },

  destroy(handle: MapHandle) {
    const internal = handle as InternalHandle
    const bag = internal.__leaflet
    if (!bag) return
    for (const fn of bag.cleanups) {
      try {
        fn()
      } catch {
        /* */
      }
    }
    bag.cleanups.length = 0
    for (const m of bag.markers.values()) {
      try {
        bag.map.removeLayer(m)
      } catch {
        /* */
      }
    }
    bag.markers.clear()
    for (const key of Object.keys(bag.listeners) as Array<keyof MapEventMap>) {
      bag.listeners[key]?.clear()
    }
    try {
      bag.map.remove()
    } catch {
      /* */
    }
  },
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
