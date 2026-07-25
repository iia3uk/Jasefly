import { registerModule, setPluginEnabled } from '@/core/moduleRegistry'
import { registerWidget } from '@/builder/registry'
import type { JaseflyFrontendModule, ModuleFrontendContext, RuntimeModuleAsset } from '@/core/packageModuleTypes'
import type { AdminScreen, PublicRouteDef } from '@/core/pluginTypes'
import type { WidgetDefinition } from '@/builder/types'

const loaded = new Set<string>()
const dashboardCards: Array<{ id: string; label: string; render: () => unknown }> = []

function isSafeModuleUrl(url: string, slug: string): boolean {
  try {
    const u = new URL(url, window.location.origin)
    if (u.origin !== window.location.origin) return false
    const prefix = `/modules/${slug}/`
    return u.pathname === prefix.slice(0, -1) || u.pathname.startsWith(prefix)
  } catch {
    return false
  }
}

function injectCss(href: string, slug: string): void {
  if (!isSafeModuleUrl(href, slug)) return
  const id = `jasefly-module-css-${slug}-${href}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

function createContext(slug: string, version: string): ModuleFrontendContext {
  const adminScreens: AdminScreen[] = []
  const adminNav: NonNullable<Parameters<typeof registerModule>[0]['adminNav']> = []
  const publicRoutes: PublicRouteDef[] = []
  const blocks: NonNullable<Parameters<typeof registerModule>[0]['blocks']> = []

  const flush = () => {
    registerModule({
      name: slug,
      label: slug,
      adminNav,
      adminScreens,
      publicRoutes,
      blocks,
    })
    setPluginEnabled(slug, true)
  }

  return {
    slug,
    version,
    registerAdminRoute: (screen) => {
      adminScreens.push(screen)
      flush()
    },
    registerAdminNavItem: (item) => {
      adminNav.push(item)
      flush()
    },
    registerPublicRoute: (route) => {
      publicRoutes.push(route)
      flush()
    },
    registerBuilderWidget: (widget: WidgetDefinition) => {
      const namespaced = widget.type.includes('.') ? widget.type : `${slug}.${widget.type}`
      registerWidget({ ...widget, type: namespaced, plugin: slug })
      blocks.push({
        type: namespaced,
        label: widget.label,
        category: widget.category,
        icon: widget.icon,
        defaultSettings: widget.defaultSettings,
        settingsFields: widget.settingsFields,
        Render: widget.Render,
        plugin: slug,
      })
      flush()
    },
    registerSettingsPage: (screen) => {
      adminScreens.push(screen)
      flush()
    },
    registerDashboardCard: (card) => {
      dashboardCards.push(card)
    },
    registerTranslation: () => {
      // v1: no-op hook for future i18n merge
    },
  }
}

async function loadOne(asset: RuntimeModuleAsset): Promise<void> {
  const slug = asset.slug
  if (!slug || loaded.has(slug) || asset.status !== 'enabled') return

  const entry = asset.entry || `/modules/${slug}/index.js`
  if (!isSafeModuleUrl(entry, slug)) {
    console.warn('[packageModuleLoader] blocked entry URL', entry)
    return
  }

  for (const css of asset.css ?? []) {
    injectCss(css, slug)
  }

  try {
    const mod = (await import(/* @vite-ignore */ entry)) as {
      default?: JaseflyFrontendModule
      module?: JaseflyFrontendModule
    }
    const pack = mod.default ?? mod.module
    if (!pack || typeof pack.register !== 'function') {
      console.warn('[packageModuleLoader] invalid module export', slug)
      return
    }
    const ctx = createContext(slug, asset.version || pack.version || '0.0.0')
    await pack.register(ctx)
    loaded.add(slug)
  } catch (e) {
    console.error('[packageModuleLoader] failed', slug, e)
  }
}

/** Load enabled package frontend modules (no Node on server). */
export async function loadPackageModules(): Promise<void> {
  try {
    const res = await fetch('/api/v1/modules/runtime-assets', { credentials: 'same-origin' })
    if (!res.ok) return
    const json = (await res.json()) as { data?: RuntimeModuleAsset[] }
    const list = Array.isArray(json.data) ? json.data : []
    for (const item of list) {
      await loadOne(item)
    }
  } catch {
    // offline / early boot
  }
}

export function getPackageDashboardCards() {
  return dashboardCards
}
