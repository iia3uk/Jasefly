/**
 * Admin CRUD resource → plugin(s) that register the API.
 * Any one enabled plugin is enough (e.g. orders via Orders or Payments fallback).
 * Resources without an entry are always available (core Content/System).
 */
export const ADMIN_RESOURCE_PLUGINS: Record<string, string[]> = {
  projects: ['projects'],
  'project-categories': ['projects'],
  blog: ['blog'],
  'blog-categories': ['blog'],
  'blog-tags': ['blog'],
  products: ['products'],
  payments: ['payments'],
  orders: ['orders', 'payments'],
  webhooks: ['webhooks'],
}

/** @deprecated use ADMIN_RESOURCE_PLUGINS / pluginsForAdminResource */
export const ADMIN_RESOURCE_PLUGIN: Record<string, string> = Object.fromEntries(
  Object.entries(ADMIN_RESOURCE_PLUGINS).map(([k, v]) => [k, v[0]!]),
)

/** Plugins that can serve an admin list/edit resource, or null for ungated core CRUD. */
export function pluginsForAdminResource(resource: string): string[] | null {
  return ADMIN_RESOURCE_PLUGINS[resource] ?? null
}

/** Primary plugin label for empty-state copy. */
export function pluginForAdminResource(resource: string): string | null {
  return pluginsForAdminResource(resource)?.[0] ?? null
}

/**
 * Public path → owning plugin. Used to hide nav links and SPA routes
 * when the plugin is disabled.
 */
export const PATH_PLUGIN_GATES: Array<{ prefix: string; plugin: string }> = [
  // about/contact — обычные CMS-страницы билдера, без Portfolio
  { prefix: '/services', plugin: 'portfolio' },
  { prefix: '/projects', plugin: 'projects' },
  { prefix: '/blog', plugin: 'blog' },
  { prefix: '/products', plugin: 'products' },
  { prefix: '/register', plugin: 'registration' },
  { prefix: '/checkout', plugin: 'payments' },
  { prefix: '/orders', plugin: 'orders' },
  { prefix: '/pay', plugin: 'payments' },
  { prefix: '/lab', plugin: 'lab' },
]

/** CMS page slugs seeded / owned by a plugin (не билдер-маркетинг). */
export const SLUG_PLUGIN_GATES: Record<string, string> = {
  about: 'portfolio',
  contact: 'portfolio',
  projects: 'projects',
  services: 'portfolio',
  blog: 'blog',
  register: 'registration',
  payment: 'payments',
  'payment-success': 'payments',
  'payment-fail': 'payments',
  offer: 'payments',
  products: 'products',
  'product-card': 'products',
  'product-detail': 'products',
}

/**
 * Admin permission slug → owning plugin (hide in Roles UI when plugin off).
 * Core permissions (content.*, users.*, media.*, system.*, roles.*, plugins.*) have no gate.
 */
export const PERMISSION_PLUGIN_GATES: Record<string, string | string[]> = {
  'commerce.manage': ['products', 'payments'],
  'orders.view': 'orders',
  'orders.manage': 'orders',
  'integrations.manage': 'webhooks',
  'forms.view': 'forms',
  'forms.manage': 'forms',
  'support.view': 'support',
  'support.manage': 'support',
  'comments.view': 'comments',
  'comments.manage': 'comments',
  'newsletter.manage': 'newsletter',
  'notifications.view': 'notifications',
  'notifications.manage': 'notifications',
  'automations.view': 'automation',
  'automations.manage': 'automation',
  'scheduler.view': 'scheduler',
  'scheduler.manage': 'scheduler',
  'translate.manage': 'translate',
  'lab.manage': 'lab',
  'analytics.view': 'analytics',
  'analytics.manage': 'analytics',
  'access.manage': 'access',
  'ddos.manage': 'ddos',
  'overload.manage': 'overload',
}

/** Whether a Roles-matrix permission should be shown for current enabled plugins. */
export function permissionVisibleForPlugins(
  slug: string,
  enabled: string[] | null | undefined,
): boolean {
  const gate = PERMISSION_PLUGIN_GATES[slug]
  if (!gate) return true
  const plugins = Array.isArray(gate) ? gate : [gate]
  return plugins.some((p) => siteHasPlugin(enabled, p))
}

export function pluginForPath(href: string | null | undefined): string | null {
  if (!href) return null
  let path = href.trim()
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname
    }
  } catch {
    /* keep raw */
  }
  path = '/' + path.replace(/^\//, '').replace(/\/$/, '')
  if (path === '/') return null
  for (const gate of PATH_PLUGIN_GATES) {
    if (path === gate.prefix || path.startsWith(gate.prefix + '/')) {
      return gate.plugin
    }
  }
  return null
}

/** Check `/site.enabled_plugins` (handles content ↔ site alias). Fail-closed until list hydrates. */
export function siteHasPlugin(enabled: string[] | null | undefined, plugin: string): boolean {
  if (!Array.isArray(enabled)) return false
  if (plugin === 'site' || plugin === 'content') {
    return enabled.includes('content') || enabled.includes('site')
  }
  return enabled.includes(plugin)
}
