import type { ReactNode } from 'react'
import { useSiteContext } from '@/context/SiteContext'
import { siteHasPlugin } from '@/core/pluginGates'

type Props = {
  plugin: string
  children: ReactNode
  /** Rendered when the plugin is off (after site/plugins hydrated). */
  fallback?: ReactNode
}

/** Gate a public route/page behind an enabled plugin. */
export function RequirePlugin({ plugin, children, fallback = null }: Props) {
  const { site, loading } = useSiteContext()
  if (loading || !Array.isArray(site?.enabled_plugins)) {
    return <div className="min-h-[40vh]" aria-hidden />
  }
  if (!siteHasPlugin(site.enabled_plugins, plugin)) {
    return <>{fallback}</>
  }
  return <>{children}</>
}
