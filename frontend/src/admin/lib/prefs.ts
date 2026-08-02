const SIDEBAR_KEY = 'admin.sidebarCollapsed'
const PINS_KEY = 'admin.pinnedNav'
const DRAFT_PREFIX = 'admin.draft:'
const LOCALE_KEY = 'admin.locale'
const DASHBOARD_LAYOUT_KEY = 'admin.dashboard.layout.v1'

export type DashboardLayoutStored = {
  order: string[]
  hidden: string[]
}

export type AdminLocale = 'ru' | 'en'

export function readAdminLocale(): AdminLocale {
  try {
    const raw = localStorage.getItem(LOCALE_KEY)
    return raw === 'en' ? 'en' : 'ru'
  } catch {
    return 'ru'
  }
}

export function writeAdminLocale(locale: AdminLocale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    /* ignore */
  }
}

export function readSidebarCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY)
    // Default: icon mosaic (compact). Explicit '0' keeps classic list.
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

export function writeSidebarCollapsed(value: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function readPinnedNav(): string[] {
  try {
    const raw = localStorage.getItem(PINS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function writePinnedNav(paths: string[]) {
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(paths.slice(0, 8)))
  } catch {
    /* ignore */
  }
}

export function draftKey(resource: string, id: string | number) {
  return `${DRAFT_PREFIX}${resource}:${id}`
}

export function readDraft<T = Record<string, unknown>>(resource: string, id: string | number): T | null {
  try {
    const raw = localStorage.getItem(draftKey(resource, id))
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeDraft(resource: string, id: string | number, data: unknown) {
  try {
    localStorage.setItem(draftKey(resource, id), JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    /* ignore */
  }
}

export function clearDraft(resource: string, id: string | number) {
  try {
    localStorage.removeItem(draftKey(resource, id))
  } catch {
    /* ignore */
  }
}

export type StoredDraft<T = Record<string, unknown>> = { savedAt: number; data: T }

export function readStoredDraft<T = Record<string, unknown>>(resource: string, id: string | number): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(draftKey(resource, id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function readDashboardLayout(): DashboardLayoutStored | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DashboardLayoutStored
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return null
    return {
      order: parsed.order.filter((x) => typeof x === 'string'),
      hidden: parsed.hidden.filter((x) => typeof x === 'string'),
    }
  } catch {
    return null
  }
}

export function writeDashboardLayout(layout: DashboardLayoutStored) {
  try {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    /* ignore */
  }
}

export function clearDashboardLayout() {
  try {
    localStorage.removeItem(DASHBOARD_LAYOUT_KEY)
  } catch {
    /* ignore */
  }
}
