import { createElement, useEffect, useState } from 'react'
import { registerModule, setPluginEnabled } from '@/core/moduleRegistry'
import { registerWidget, getWidget } from '@/builder/registry'
import type { AdminScreen, PublicRouteDef } from '@/core/pluginTypes'
import type { WidgetDefinition } from '@/builder/types'
import type { PlatformFrontendContext } from '@/platform/types'
import {
  platformRegistry,
  trackUnregister,
} from '@/platform/registry'

const FEATURES: Record<string, boolean> = {
  'builder.widgets': true,
  'builder.inspector': true,
  'builder.toolbar': true,
  'admin.dashboard_cards': true,
  'admin.search_providers': true,
  'public.routes': true,
  'sdk.v2': true,
}

function PackagePlaceholderPage({ title, slug }: { title: string; slug: string }) {
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

function ensureAdminScreen(screen: AdminScreen, slug: string): AdminScreen {
  if (screen.element || screen.Component || screen.lazy) return screen
  return {
    ...screen,
    Component: () => createElement(PackagePlaceholderPage, { title: screen.label || slug, slug }),
  }
}

export function createPlatformFrontendContext(slug: string, version: string, sdkVersion = 1): PlatformFrontendContext {
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

  trackUnregister(slug, () => setPluginEnabled(slug, false))

  return {
    slug,
    version,
    sdkVersion,
    feature: (flag) => FEATURES[flag] ?? false,
    admin: {
      registerPage: (screen) => {
        adminScreens.push(ensureAdminScreen(screen, slug))
        flush()
      },
      registerNavItem: (item) => {
        adminNav.push(item)
        flush()
      },
      registerSettingsSection: (screen) => {
        adminScreens.push(ensureAdminScreen(screen, slug))
        flush()
      },
      registerDashboardCard: (card) => {
        platformRegistry.dashboardCards.push({ ...card, slug })
      },
      registerTopBarButton: (btn) => {
        platformRegistry.topBarButtons.push({ ...btn, slug })
      },
      registerSearchProvider: (provider) => {
        platformRegistry.searchProviders.push({ ...provider, slug })
      },
    },
    builder: {
      registerWidget: (widget: WidgetDefinition) => {
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
        trackUnregister(slug, () => {
          /* widget registry has no delete — gated by plugin enable */
          void getWidget(namespaced)
        })
        flush()
      },
      registerPropertyEditor: (type, editor) => {
        platformRegistry.propertyEditors.set(type, { slug, editor })
      },
      registerInspectorPanel: (panel) => {
        platformRegistry.inspectorPanels.push({ ...panel, slug })
      },
      registerToolbarAction: (action) => {
        platformRegistry.toolbarActions.push({ ...action, slug })
      },
      registerContextMenuItem: (item) => {
        platformRegistry.contextMenuItems.push({ ...item, slug })
      },
      registerBlockPreset: (preset) => {
        platformRegistry.blockPresets.push({ ...preset, slug })
      },
      registerCategory: (category) => {
        platformRegistry.categories.add(category)
      },
    },
    public: {
      registerRoute: (route) => {
        publicRoutes.push(route)
        platformRegistry.publicRoutes.push({ ...route, slug })
        flush()
      },
      registerPathGate: (prefix) => {
        platformRegistry.pathGates.push({ slug, prefix })
      },
    },
  }
}
