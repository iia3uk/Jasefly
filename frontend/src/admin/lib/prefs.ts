const SIDEBAR_KEY = 'admin.sidebarCollapsed'
const PINS_KEY = 'admin.pinnedNav'
const DRAFT_PREFIX = 'admin.draft:'
const LOCALE_KEY = 'admin.locale'

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
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
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
