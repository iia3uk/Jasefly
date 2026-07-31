import { useSyncExternalStore } from 'react'

/** Legacy binary consent (pre cookie-consent ZIP). */
export type CookieConsentLegacy = 'all' | 'necessary'

/** Category map used by Cookie Consent ZIP + core helpers. */
export type CookieConsentCategories = Record<string, boolean>

const STORAGE_KEY = 'jasefly_cookie_consent'

type StoredV2 = {
  v: 2
  categories: CookieConsentCategories
  policy_version?: string
  at?: string
}

function parseStored(raw: string | null): CookieConsentCategories | null {
  if (!raw) return null
  if (raw === 'all') return { necessary: true, analytics: true, marketing: true }
  if (raw === 'necessary') return { necessary: true, analytics: false, marketing: false }
  try {
    const parsed = JSON.parse(raw) as StoredV2 | CookieConsentCategories
    if (parsed && typeof parsed === 'object') {
      if ('categories' in parsed && parsed.categories && typeof parsed.categories === 'object') {
        return { ...parsed.categories, necessary: true }
      }
      if ('necessary' in parsed || 'analytics' in parsed || 'marketing' in parsed) {
        return { ...(parsed as CookieConsentCategories), necessary: true }
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** @deprecated prefer readCookieCategories / allowsAnalytics */
export type CookieConsent = CookieConsentLegacy

export function readCookieCategories(): CookieConsentCategories | null {
  try {
    return parseStored(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

/** Legacy reader: maps categories → all | necessary. */
export function readCookieConsent(): CookieConsentLegacy | null {
  const cats = readCookieCategories()
  if (!cats) return null
  if (cats.analytics || cats.marketing) return 'all'
  return 'necessary'
}

export function writeCookieConsent(value: CookieConsentLegacy): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
    window.dispatchEvent(new CustomEvent('jasefly-cookie-consent', { detail: value }))
    window.dispatchEvent(
      new CustomEvent('jasefly-cookie:change', {
        detail: {
          categories: value === 'all'
            ? { necessary: true, analytics: true, marketing: true }
            : { necessary: true, analytics: false, marketing: false },
        },
      }),
    )
  } catch {
    /* ignore */
  }
}

export function writeCookieCategories(categories: CookieConsentCategories, meta?: { policy_version?: string }): void {
  try {
    const next: CookieConsentCategories = { ...categories, necessary: true }
    const payload: StoredV2 = {
      v: 2,
      categories: next,
      policy_version: meta?.policy_version || '1',
      at: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    const legacy: CookieConsentLegacy = next.analytics || next.marketing ? 'all' : 'necessary'
    window.dispatchEvent(new CustomEvent('jasefly-cookie-consent', { detail: legacy }))
    window.dispatchEvent(new CustomEvent('jasefly-cookie:change', { detail: { categories: next, ...meta } }))
  } catch {
    /* ignore */
  }
}

/** Analytics (GA/GTM/beacon) allowed? */
export function allowsAnalytics(consent: CookieConsentLegacy | CookieConsentCategories | null | undefined): boolean {
  if (consent == null) return false
  if (typeof consent === 'string') return consent === 'all'
  return !!consent.analytics
}

export function useCookieConsent(): CookieConsentLegacy | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      const handler = () => onStoreChange()
      window.addEventListener('jasefly-cookie-consent', handler)
      window.addEventListener('jasefly-cookie:change', handler)
      window.addEventListener('storage', handler)
      return () => {
        window.removeEventListener('jasefly-cookie-consent', handler)
        window.removeEventListener('jasefly-cookie:change', handler)
        window.removeEventListener('storage', handler)
      }
    },
    () => readCookieConsent(),
    () => null,
  )
}

export function useCookieCategories(): CookieConsentCategories | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      const handler = () => onStoreChange()
      window.addEventListener('jasefly-cookie-consent', handler)
      window.addEventListener('jasefly-cookie:change', handler)
      window.addEventListener('storage', handler)
      return () => {
        window.removeEventListener('jasefly-cookie-consent', handler)
        window.removeEventListener('jasefly-cookie:change', handler)
        window.removeEventListener('storage', handler)
      }
    },
    () => readCookieCategories(),
    () => null,
  )
}

/** True when ZIP cookie-consent is listed in /site.enabled_plugins. */
export function isCookieConsentModuleEnabled(enabledPlugins: string[] | null | undefined): boolean {
  return Array.isArray(enabledPlugins) && enabledPlugins.includes('cookie-consent')
}
