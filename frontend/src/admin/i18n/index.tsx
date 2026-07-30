import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from 'react'
import * as ru from '@/admin/i18n/ru'
import * as en from '@/admin/i18n/en'
import { readAdminLocale, writeAdminLocale, type AdminLocale } from '@/admin/lib/prefs'

export type { AdminLocale }

type Pack = typeof ru

const packs: Record<AdminLocale, Pack> = { ru, en: en as unknown as Pack }

let activeLocale: AdminLocale = typeof window !== 'undefined' ? readAdminLocale() : 'ru'
let activePack: Pack = packs[activeLocale]

function applyLocale(locale: AdminLocale) {
  activeLocale = locale
  activePack = packs[locale]
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'en' ? 'en' : 'ru'
  }
}

applyLocale(activeLocale)

type LocaleCtx = {
  locale: AdminLocale
  setLocale: (locale: AdminLocale) => void
  t: Pack['t']
}

const AdminLocaleContext = createContext<LocaleCtx | null>(null)

/** Live dictionary — reads active pack (re-render tree via AdminLocaleProvider). */
export const t: Pack['t'] = new Proxy({} as Pack['t'], {
  get(_target, prop) {
    return (activePack.t as Record<string | symbol, unknown>)[prop]
  },
}) as Pack['t']

export const dashboardCounts: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined
    return activePack.dashboardCounts[prop]
  },
})

export const resources: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined
    return activePack.resources[prop]
  },
})

export const navGroupLabels: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined
    return (activePack as Pack & { navGroupLabels?: Record<string, string> }).navGroupLabels?.[prop]
  },
})

export function translateNavGroup(group: string): string {
  const pack = activePack as Pack & { navGroupLabels?: Record<string, string> }
  return pack.navGroupLabels?.[group] ?? group
}

export function resourceTitle(key: string): string {
  return activePack.resourceTitle(key)
}

export function fieldLabel(key: string): string {
  return activePack.fieldLabel(key)
}

export function pageTitle(resource: string, isNew: boolean): string {
  return activePack.pageTitle(resource, isNew)
}

export function AdminLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AdminLocale>(() => readAdminLocale())

  const setLocale = useCallback((next: AdminLocale) => {
    writeAdminLocale(next)
    applyLocale(next)
    setLocaleState(next)
  }, [])

  // Keep module pack in sync with React state (also after HMR).
  applyLocale(locale)

  const value = useMemo<LocaleCtx>(
    () => ({ locale, setLocale, t: activePack.t }),
    [locale, setLocale],
  )

  return <AdminLocaleContext.Provider value={value}>{children}</AdminLocaleContext.Provider>
}

export function useAdminLocale() {
  const ctx = useContext(AdminLocaleContext)
  if (!ctx) throw new Error('useAdminLocale must be used within AdminLocaleProvider')
  return ctx
}
