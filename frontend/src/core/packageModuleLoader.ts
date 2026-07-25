import { createElement, useEffect, useState, type ReactElement } from 'react'
import { registerModule, setPluginEnabled } from '@/core/moduleRegistry'
import { registerWidget } from '@/builder/registry'
import type { JaseflyFrontendModule, ModuleFrontendContext, RuntimeModuleAsset } from '@/core/packageModuleTypes'
import type { AdminScreen, PublicRouteDef } from '@/core/pluginTypes'
import type { WidgetDefinition } from '@/builder/types'

const loaded = new Set<string>()
const dashboardCards: Array<{ id: string; label: string; render: () => unknown }> = []

type LegacyFrontendExport = {
  slug?: string
  name?: string
  label?: string
  version?: string
  register?: (context: ModuleFrontendContext) => void | Promise<void>
  adminNav?: Array<{
    group: string
    path: string
    label: string
    permission?: string
    icon?: string
  }>
  adminScreens?: Array<{
    path: string
    label: string
    group: string
    permission?: string
    element?: ReactElement
    Component?: AdminScreen['Component']
  }>
}

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

function PlaceholderPage({ title, slug }: { title: string; slug: string }) {
  const [phase, setPhase] = useState<'loading' | 'ok' | 'err'>('loading')
  const [payload, setPayload] = useState('')

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('access_token')
    setPhase('loading')
    void fetch(`/api/v1/admin/${encodeURIComponent(slug)}/ping`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'same-origin',
    })
      .then(async (res) => {
        const text = await res.text()
        let pretty = text
        try {
          pretty = JSON.stringify(JSON.parse(text), null, 2)
        } catch {
          /* keep raw */
        }
        if (cancelled) return
        setPayload(pretty)
        setPhase(res.ok ? 'ok' : 'err')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setPayload(e instanceof Error ? e.message : String(e))
        setPhase('err')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  return createElement(
    'div',
    { className: 'p-6 space-y-4 max-w-2xl' },
    createElement('h1', { className: 'text-xl font-semibold' }, title),
    createElement(
      'p',
      { className: 'text-sm text-zinc-500' },
      `GET /api/v1/admin/${slug}/ping`,
    ),
    createElement(
      'pre',
      {
        className:
          'overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 text-xs whitespace-pre-wrap ' +
          (phase === 'ok' ? 'text-emerald-200' : phase === 'err' ? 'text-red-300' : 'text-zinc-400'),
      },
      phase === 'loading' ? 'Запрос ping…' : payload,
    ),
  )
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

  const ensureScreen = (screen: AdminScreen): AdminScreen => {
    if (screen.element || screen.Component || screen.lazy) return screen
    return {
      ...screen,
      Component: () => createElement(PlaceholderPage, { title: screen.label || slug, slug }),
    }
  }

  return {
    slug,
    version,
    registerAdminRoute: (screen) => {
      adminScreens.push(ensureScreen(screen))
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
      })
      flush()
    },
    registerSettingsPage: (screen) => {
      adminScreens.push(ensureScreen(screen))
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

/** Accept contract v1 (register) or legacy static adminNav/adminScreens. */
function normalizePack(raw: unknown, fallbackSlug: string, fallbackVersion: string): JaseflyFrontendModule | null {
  if (!raw || typeof raw !== 'object') return null
  const pack = raw as LegacyFrontendExport
  if (typeof pack.register === 'function') {
    return {
      slug: pack.slug || fallbackSlug,
      version: pack.version || fallbackVersion,
      register: pack.register.bind(pack),
    }
  }
  const hasLegacy = (pack.adminNav?.length ?? 0) > 0 || (pack.adminScreens?.length ?? 0) > 0
  if (!hasLegacy) return null

  return {
    slug: pack.slug || pack.name || fallbackSlug,
    version: pack.version || fallbackVersion,
    register: (ctx) => {
      for (const item of pack.adminNav ?? []) {
        ctx.registerAdminNavItem(item)
      }
      for (const screen of pack.adminScreens ?? []) {
        ctx.registerAdminRoute({
          path: screen.path,
          label: screen.label,
          group: screen.group,
          permission: screen.permission,
          element: screen.element,
          Component: screen.Component,
        })
      }
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
      default?: unknown
      module?: unknown
      JaseflyFrontendModule?: unknown
    }
    const raw = mod.default ?? mod.module ?? mod.JaseflyFrontendModule
    const pack = normalizePack(raw, slug, asset.version || '0.0.0')
    if (!pack) {
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
