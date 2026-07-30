/**
 * Admin hub configs — related screens share one sidebar entry and in-page tabs.
 * Paths are stored in canonical `/admin/...` form; remap with adminUrl() at render.
 */

import { adminUrl, toCanonicalAdminPath } from '@/admin/adminBasePath'

export type AdminHubTab = {
  /** List/root path for this tab (also used as NavLink target). */
  path: string
  label: string
  /** Path prefixes that activate this tab (includes edit routes). */
  match: string[]
}

export type AdminHub = {
  id: string
  /** Sidebar nav path (first tab / hub home). */
  navPath: string
  /** Label shown for the sidebar item. */
  navLabel: string
  icon?: string
  tabs: AdminHubTab[]
}

export const ADMIN_HUBS: AdminHub[] = [
  {
    id: 'portfolio',
    navPath: '/admin/profile',
    navLabel: 'Портфолио',
    icon: 'users',
    tabs: [
      { path: '/admin/profile', label: 'Профиль', match: ['/admin/profile'] },
      { path: '/admin/statistics', label: 'Статистика', match: ['/admin/statistics'] },
      { path: '/admin/experience', label: 'Опыт', match: ['/admin/experience'] },
      { path: '/admin/education', label: 'Образование', match: ['/admin/education'] },
      { path: '/admin/skills', label: 'Навыки', match: ['/admin/skills'] },
      { path: '/admin/skill-categories', label: 'Категории', match: ['/admin/skill-categories'] },
      { path: '/admin/testimonials', label: 'Отзывы', match: ['/admin/testimonials'] },
    ],
  },
  {
    id: 'site-appearance',
    navPath: '/admin/hero',
    navLabel: 'Оформление',
    icon: 'panel-top',
    tabs: [
      { path: '/admin/hero', label: 'Hero', match: ['/admin/hero'] },
      { path: '/admin/homepage', label: 'Главная', match: ['/admin/homepage'] },
      { path: '/admin/navigation', label: 'Навигация', match: ['/admin/navigation'] },
      { path: '/admin/footer', label: 'Подвал', match: ['/admin/footer'] },
      { path: '/admin/social-links', label: 'Соцсети', match: ['/admin/social-links'] },
      { path: '/admin/contact-info', label: 'Контакты', match: ['/admin/contact-info'] },
    ],
  },
  {
    id: 'site-settings',
    navPath: '/admin/site-settings',
    navLabel: 'Настройки сайта',
    icon: 'settings',
    tabs: [
      { path: '/admin/site-settings', label: 'Сайт', match: ['/admin/site-settings'] },
      { path: '/admin/seo', label: 'SEO', match: ['/admin/seo'] },
      { path: '/admin/redirects', label: 'Редиректы', match: ['/admin/redirects'] },
      { path: '/admin/theme', label: 'Шаблон', match: ['/admin/theme'] },
    ],
  },
  {
    id: 'users',
    navPath: '/admin/users',
    navLabel: 'Пользователи',
    icon: 'users',
    tabs: [
      { path: '/admin/users', label: 'Список', match: ['/admin/users'] },
      { path: '/admin/roles', label: 'Роли и права', match: ['/admin/roles'] },
    ],
  },
  {
    id: 'products',
    navPath: '/admin/products',
    navLabel: 'Товары',
    icon: 'shopping-cart',
    tabs: [
      { path: '/admin/products', label: 'Список', match: ['/admin/products'] },
      { path: '/admin/products-templates', label: 'Шаблоны витрины', match: ['/admin/products-templates'] },
    ],
  },
  {
    id: 'orders',
    navPath: '/admin/orders',
    navLabel: 'Заказы',
    icon: 'shopping-cart',
    tabs: [
      { path: '/admin/orders', label: 'Заказы', match: ['/admin/orders'] },
      { path: '/admin/payments', label: 'Платежи', match: ['/admin/payments'] },
    ],
  },
]

function pathMatches(pathname: string, prefix: string): boolean {
  const canon = toCanonicalAdminPath(pathname)
  return canon === prefix || canon.startsWith(`${prefix}/`)
}

export function findHubByPath(pathname: string): AdminHub | undefined {
  return ADMIN_HUBS.find((hub) =>
    hub.tabs.some((tab) => tab.match.some((m) => pathMatches(pathname, m))),
  )
}

/** Hub whose sidebar entry is this path (parent item, not a deep tab). */
export function findHubByNavPath(navPath: string): AdminHub | undefined {
  const canon = toCanonicalAdminPath(navPath)
  return ADMIN_HUBS.find((h) => toCanonicalAdminPath(h.navPath) === canon)
}

/** Tabs visible for the current plugin enablement (same rules as AdminHubTabs). */
export function visibleHubTabs(
  hub: AdminHub,
  flags: { products?: boolean; payments?: boolean; orders?: boolean },
): AdminHubTab[] {
  return hub.tabs.filter((tab) => {
    const canon = tab.path
    if (canon.startsWith('/admin/products')) return !!flags.products
    if (canon === '/admin/payments' || canon.startsWith('/admin/payments/')) return !!flags.payments
    if (canon === '/admin/orders' || canon.startsWith('/admin/orders/')) {
      return !!flags.orders || !!flags.payments
    }
    return true
  })
}

export function findActiveHubTab(hub: AdminHub, pathname: string): AdminHubTab | undefined {
  const ranked = [...hub.tabs].sort((a, b) => {
    const am = Math.max(...a.match.map((m) => m.length))
    const bm = Math.max(...b.match.map((m) => m.length))
    return bm - am
  })
  return ranked.find((tab) => tab.match.some((m) => pathMatches(pathname, m)))
}

/** Whether a sidebar nav path should appear active for the current location. */
export function isHubNavActive(navPath: string, pathname: string): boolean {
  const canonNav = toCanonicalAdminPath(navPath)
  const hub = ADMIN_HUBS.find((h) => h.navPath === canonNav || h.navPath === navPath)
  if (!hub) {
    const live = adminUrl(navPath)
    return pathname === live || pathname.startsWith(`${live}/`)
  }
  return findHubByPath(pathname)?.id === hub.id
}

/** Resolve a pinned (possibly deep) path to a display entry. */
export function resolveHubPin(path: string): { path: string; label: string; icon?: string } | undefined {
  const hub = findHubByPath(path)
  if (!hub) return undefined
  const tab = findActiveHubTab(hub, path)
  return {
    path,
    label: tab?.label ?? hub.navLabel,
    icon: hub.icon,
  }
}
