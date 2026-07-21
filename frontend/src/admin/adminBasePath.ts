/** localStorage cache so /custom/login works before site payload arrives. */
const STORAGE_KEY = 'jasefly_admin_base'

const RESERVED_PUBLIC = new Set([
  'api', 'assets', 'static', 'media', 'register', 'login', 'logout',
  'about', 'projects', 'services', 'products', 'blog', 'contact', 'privacy',
  'search', 'sitemap', 'robots', 'maintenance', 'not-found',
])

let cachedBase = 'admin'

function readStoredBase(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.trim() ? v.trim().toLowerCase() : null
  } catch {
    return null
  }
}

function writeStoredBase(base: string) {
  try {
    localStorage.setItem(STORAGE_KEY, base)
  } catch {
    /* ignore */
  }
}

/** Normalize a raw setting to a single path segment. Empty → admin. */
export function normalizeAdminBase(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase().replace(/^\/+|\/+$/g, '')
  if (!s || s === 'admin') return 'admin'
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(s)) return 'admin'
  if (RESERVED_PUBLIC.has(s)) return 'admin'
  return s
}

/** Current SPA admin base segment (sync; updated from site payload). */
export function getAdminBase(): string {
  return cachedBase || 'admin'
}

/** Call when site payload loads (or after saving site-settings). */
export function setAdminBaseFromSite(adminBasePath: unknown): string {
  const base = normalizeAdminBase(adminBasePath)
  cachedBase = base
  writeStoredBase(base)
  return base
}

/** Boot from localStorage before site fetch (login page on custom path). */
export function hydrateAdminBaseFromStorage(): string {
  const stored = readStoredBase()
  if (stored) {
    cachedBase = normalizeAdminBase(stored)
  }
  return cachedBase
}

hydrateAdminBaseFromStorage()

/**
 * Build an admin SPA URL.
 * Accepts canonical `/admin/...`, relative `pages`, or already-remapped `/{base}/...`.
 */
export function adminUrl(path: string = ''): string {
  const base = getAdminBase()
  let rest = String(path || '').trim()
  if (!rest || rest === '/') return `/${base}`
  if (rest.startsWith('/admin/') || rest === '/admin') {
    rest = rest === '/admin' ? '' : rest.slice('/admin'.length)
  } else if (rest.startsWith(`/${base}/`) || rest === `/${base}`) {
    rest = rest === `/${base}` ? '' : rest.slice(base.length + 1)
  }
  rest = rest.replace(/^\/+/, '')
  return rest ? `/${base}/${rest}` : `/${base}`
}

export function adminLoginUrl(next?: string | null): string {
  const login = adminUrl('/login')
  if (!next) return login
  const n = String(next)
  if (!n || n === login) return login
  return `${login}?next=${encodeURIComponent(n)}`
}

/** True if pathname is under the current admin SPA base. */
export function isAdminPathname(pathname: string): boolean {
  const base = getAdminBase()
  return pathname === `/${base}` || pathname.startsWith(`/${base}/`)
}

/** `/panel/activity` → `/activity`; `/panel` → `/`. */
export function stripAdminBase(pathname: string): string {
  const base = getAdminBase()
  const prefix = `/${base}`
  if (pathname === prefix || pathname === `${prefix}/`) return '/'
  if (pathname.startsWith(`${prefix}/`)) {
    const rest = pathname.slice(prefix.length + 1)
    return rest ? `/${rest}` : '/'
  }
  // Legacy /admin while base already changed — still strip for resolvers during transition
  if (pathname === '/admin' || pathname === '/admin/') return '/'
  if (pathname.startsWith('/admin/')) {
    const rest = pathname.slice('/admin/'.length)
    return rest ? `/${rest}` : '/'
  }
  return pathname
}

/** `/panel/profile` → `/admin/profile` (canonical for hubs/pins). */
export function toCanonicalAdminPath(pathname: string): string {
  const base = getAdminBase()
  const prefix = `/${base}`
  if (pathname === prefix || pathname === `${prefix}/`) return '/admin'
  if (pathname.startsWith(`${prefix}/`)) {
    return `/admin/${pathname.slice(prefix.length + 1)}`
  }
  return pathname
}

export function isReservedAdminBase(segment: string): boolean {
  const s = segment.trim().toLowerCase()
  return RESERVED_PUBLIC.has(s)
}
