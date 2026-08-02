import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react'
import { useSite } from '@/hooks/useApi'
import { hydrateDemoPlugins, setEnabledPlugins } from '@/core/moduleRegistry'
import { setAdminBaseFromSite } from '@/admin/adminBasePath'
import type { SitePayload } from '@/types'

const SiteContext = createContext<{ site?: SitePayload; loading: boolean }>({ loading: true })

function isDemoSession(): boolean {
  try {
    return localStorage.getItem('is_demo') === '1'
  } catch {
    return false
  }
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const { data: site, isLoading: loading } = useSite()

  useLayoutEffect(() => {
    // Demo sandbox shows the full admin nav — never shrink to production plugin flags.
    if (isDemoSession()) {
      hydrateDemoPlugins()
      return
    }
    if (Array.isArray(site?.enabled_plugins)) {
      setEnabledPlugins(site.enabled_plugins)
    }
  }, [site?.enabled_plugins])

  useLayoutEffect(() => {
    if (site?.site_settings) {
      setAdminBaseFromSite(site.site_settings.admin_base_path)
    }
  }, [site?.site_settings, site?.site_settings?.admin_base_path])

  return <SiteContext.Provider value={{ site, loading }}>{children}</SiteContext.Provider>
}

export const useSiteContext = () => useContext(SiteContext)
