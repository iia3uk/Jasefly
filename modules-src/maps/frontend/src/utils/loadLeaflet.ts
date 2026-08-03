declare global {
  interface Window {
    L?: typeof import('leaflet')
  }
}

let loading: Promise<typeof import('leaflet')> | null = null

function loadCss(href: string): void {
  if (typeof document === 'undefined') return
  const id = `jasefly-maps-css-${href}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('SSR: no document'))
      return
    }
    const id = `jasefly-maps-js-${src}`
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing) {
      if (window.L) {
        resolve()
        return
      }
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

/** Lazy-load vendored Leaflet from module assets (no CDN). */
export function loadLeaflet(assetBase: string): Promise<typeof import('leaflet')> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('SSR: Leaflet unavailable'))
  }
  if (window.L) {
    return Promise.resolve(window.L as unknown as typeof import('leaflet'))
  }
  if (loading) return loading
  const base = assetBase.replace(/\/$/, '')
  loadCss(`${base}/leaflet.css`)
  loading = loadScript(`${base}/leaflet.js`).then(() => {
    const L = window.L
    if (!L) throw new Error('Leaflet global missing after load')
    // Fix default marker icon paths for packaged assets
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const IconDefault = (L as any).Icon?.Default
    if (IconDefault?.mergeOptions) {
      IconDefault.mergeOptions({
        iconUrl: `${base}/images/marker-icon.png`,
        iconRetinaUrl: `${base}/images/marker-icon-2x.png`,
        shadowUrl: `${base}/images/marker-shadow.png`,
      })
    }
    return L as unknown as typeof import('leaflet')
  })
  loading.catch(() => {
    loading = null
  })
  return loading
}

export function moduleAssetBase(): string {
  if (typeof window === 'undefined') return '/modules/maps/assets'
  return `${window.location.origin}/modules/maps/assets`
}
