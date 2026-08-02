import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { findActiveHubTab, findHubByPath, visibleHubTabs } from '@/admin/adminHubs'
import { adminUrl } from '@/admin/adminBasePath'
import { usePluginEnabled } from '@/hooks/useApi'

/** In-page tabs for an admin hub; sticky under header, wraps instead of endless X-scroll. */
export function AdminHubTabs() {
  const { pathname } = useLocation()
  const hub = findHubByPath(pathname)
  const productsOn = usePluginEnabled('products')
  const paymentsOn = usePluginEnabled('payments')
  const ordersOn = usePluginEnabled('orders')
  const navRef = useRef<HTMLElement>(null)

  const tabs = hub && hub.tabs.length >= 2
    ? visibleHubTabs(hub, {
        products: productsOn,
        payments: paymentsOn,
        orders: ordersOn,
      })
    : []

  const active = hub && tabs.length >= 2
    ? findActiveHubTab({ ...hub, tabs }, pathname)
    : undefined

  useEffect(() => {
    if (!active || !navRef.current) return
    const el = navRef.current.querySelector<HTMLElement>(`[data-hub-tab="${active.path}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [active?.path])

  if (!hub || tabs.length < 2) return null

  return (
    <div className="sticky top-14 z-10 -mx-4 mb-4 border-b border-white/10 bg-[#0a0a0b]/95 px-4 backdrop-blur sm:top-16 sm:-mx-5 sm:mb-5 sm:px-5 lg:-mx-8 lg:px-8">
      <nav
        ref={navRef}
        className="flex flex-wrap gap-x-0.5 gap-y-0"
        aria-label={hub.navLabel}
      >
        {tabs.map((tab) => {
          const selected = active?.path === tab.path
          return (
            <NavLink
              key={tab.path}
              data-hub-tab={tab.path}
              to={adminUrl(tab.path)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm transition ${
                selected
                  ? 'border-white text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:border-white/20 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
