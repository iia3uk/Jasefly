import { NavLink, useLocation } from 'react-router-dom'
import { findActiveHubTab, findHubByPath } from '@/admin/adminHubs'
import { adminUrl } from '@/admin/adminBasePath'
import { usePluginEnabled } from '@/hooks/useApi'

/** In-page tabs for an admin hub; renders nothing outside hub routes. */
export function AdminHubTabs() {
  const { pathname } = useLocation()
  const hub = findHubByPath(pathname)
  const productsOn = usePluginEnabled('products')
  const paymentsOn = usePluginEnabled('payments')
  const ordersOn = usePluginEnabled('orders')

  if (!hub || hub.tabs.length < 2) return null

  const tabs = hub.tabs.filter((tab) => {
    const canon = tab.path
    if (canon.startsWith('/admin/products')) return productsOn
    if (canon === '/admin/payments' || canon.startsWith('/admin/payments/')) return paymentsOn
    if (canon === '/admin/orders' || canon.startsWith('/admin/orders/')) return ordersOn || paymentsOn
    return true
  })
  if (tabs.length < 2) return null

  const active = findActiveHubTab({ ...hub, tabs }, pathname)

  return (
    <div className="mb-4 border-b border-white/10 sm:mb-6">
      <nav
        className="-mb-px flex gap-1 overflow-x-auto"
        aria-label={hub.navLabel}
      >
        {tabs.map((tab) => {
          const selected = active?.path === tab.path
          return (
            <NavLink
              key={tab.path}
              to={adminUrl(tab.path)}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm transition ${
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
