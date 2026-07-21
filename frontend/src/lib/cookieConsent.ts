import { useSyncExternalStore } from 'react'

/** Cookie consent preference for analytics gate. */
export type CookieConsent = 'all' | 'necessary'

const STORAGE_KEY = 'jasefly_cookie_consent'

export function readCookieConsent(): CookieConsent | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'all' || v === 'necessary') return v
  } catch {
    /* private mode */
  }
  return null
}

export function writeCookieConsent(value: CookieConsent): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
    window.dispatchEvent(new CustomEvent('jasefly-cookie-consent', { detail: value }))
  } catch {
    /* ignore */
  }
}

export function useCookieConsent(): CookieConsent | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      const handler = () => onStoreChange()
      window.addEventListener('jasefly-cookie-consent', handler)
      window.addEventListener('storage', handler)
      return () => {
        window.removeEventListener('jasefly-cookie-consent', handler)
        window.removeEventListener('storage', handler)
      }
    },
    () => readCookieConsent(),
    () => null,
  )
}
