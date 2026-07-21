/**
 * Public path → owning plugin. Used to hide nav links and SPA routes
 * when the plugin is disabled.
 */
export const PATH_PLUGIN_GATES: Array<{ prefix: string; plugin: string }> = [
  { prefix: '/about', plugin: 'portfolio' },
  { prefix: '/contact', plugin: 'portfolio' },
  { prefix: '/services', plugin: 'portfolio' },
  { prefix: '/projects', plugin: 'portfolio' },
  { prefix: '/blog', plugin: 'portfolio' },
  { prefix: '/products', plugin: 'products' },
  { prefix: '/register', plugin: 'registration' },
  { prefix: '/checkout', plugin: 'payments' },
  { prefix: '/pay', plugin: 'payments' },
]

/** CMS page slugs seeded / owned by a plugin. */
export const SLUG_PLUGIN_GATES: Record<string, string> = {
  about: 'portfolio',
  contact: 'portfolio',
  projects: 'portfolio',
  blog: 'portfolio',
  services: 'portfolio',
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

/** Check `/site.enabled_plugins` (handles content ↔ site alias). */
export function siteHasPlugin(enabled: string[] | null | undefined, plugin: string): boolean {
  if (!Array.isArray(enabled)) return true
  if (plugin === 'site' || plugin === 'content') {
    return enabled.includes('content') || enabled.includes('site')
  }
  return enabled.includes(plugin)
}
