import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactElement } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { getAdminScreens, getBlueprints, getModules, subscribePluginState } from '@/core/moduleRegistry'
import { CrudListPage, CrudEditPage } from '@/admin/pages/AdminPages'
import { SingletonPage } from '@/admin/pages/SitePages'
import { AdminRouteParamsProvider } from '@/admin/AdminRouteParams'
import type { AdminScreen } from '@/core/pluginTypes'
import { useAuth } from '@/context/AuthContext'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { permissionForAdminSegment } from '@/admin/rolePermissions'
import { PackageErrorBoundary } from '@/platform/PackageErrorBoundary'

import { LazyLoaderFallback } from '@/builder/public/CmsPages'
import { stripAdminBase } from '@/admin/adminBasePath'

function resolveScreenElement(screen: AdminScreen): ReactElement {
  const slug = screen.path.split('/')[0] ?? 'module'
  if (screen.element) {
    return (
      <PackageErrorBoundary slug={slug} label={screen.label}>
        {screen.element}
      </PackageErrorBoundary>
    )
  }
  let Comp: ComponentType | null = null
  if (screen.Component) Comp = screen.Component
  else if (screen.lazy) Comp = lazy(screen.lazy)
  if (!Comp) {
    return (
      <div className="p-10 text-sm text-red-400">
        Admin screen missing component: {screen.label}
      </div>
    )
  }
  return (
    <PackageErrorBoundary slug={slug} label={screen.label}>
      <Comp />
    </PackageErrorBoundary>
  )
}

/**
 * Build the full set of admin route descriptors from the registry:
 *   - Generic CRUD routes from declared blueprints (list + edit, or singleton).
 *   - Custom admin screens contributed by plugin manifests.
 *
 * Each entry has a relative path (under /admin) and a renderable element.
 */
type AdminRouteEntry = { path: string; element: ReactElement }

function buildAdminRoutes(): AdminRouteEntry[] {
  const entries: AdminRouteEntry[] = []
  const screens = getAdminScreens()
  const screenPaths = new Set(screens.map((s) => s.path))

  for (const bp of Object.values(getBlueprints())) {
    if (bp.singleton) {
      if (!screenPaths.has(bp.key)) {
        entries.push({ path: bp.key, element: <SingletonPage path={bp.key} title={bp.label} /> })
      }
    } else {
      if (!screenPaths.has(bp.key)) {
        entries.push({ path: bp.key, element: <CrudListPage resource={bp.key} /> })
      }
      // Кастомный экран products/:id / products/new перекрывает generic CRUD.
      if (!screenPaths.has(`${bp.key}/:id`) && !screenPaths.has(`${bp.key}/new`)) {
        entries.push({ path: `${bp.key}/:id`, element: <CrudEditPage resource={bp.key} /> })
      }
    }
  }
  for (const screen of screens) {
    entries.push({ path: screen.path, element: resolveScreenElement(screen) })
  }
  return entries
}

/**
 * AdminScreenResolver — renders the admin screen matching the current URL.
 *
 * React Router cannot match routes rendered dynamically at runtime, so the
 * plugin-driven admin routes are resolved here by matching the current path
 * against the registry (blueprints + admin screens). This is the single
 * dynamic entry point mounted inside the AdminShell outlet.
 */
export function AdminScreenResolver() {
  const location = useLocation()
  const { can } = useAuth()
  const [, setTick] = useState(0)
  useEffect(() => subscribePluginState(() => setTick((n) => n + 1)), [])

  // react-router v7's matchPath normalizes the pattern to a leading slash,
  // so the pathname passed to it MUST start with "/". Strip the admin base
  // but keep a leading slash: "/admin/activity" or "/panel/activity" -> "/activity".
  const relativePath = stripAdminBase(location.pathname)
  const displayPath = relativePath.replace(/^\//, '')
  const segment = displayPath.split('/')[0] ?? ''
  const needed = permissionForAdminSegment(segment)
  if (needed && !can(needed)) {
    return <RequirePermission permission={needed}>{null}</RequirePermission>
  }

  const modules = getModules()
  const blueprints = getBlueprints()
  const screens = getAdminScreens()
  const entries = buildAdminRoutes()

  // Sort by specificity: more path segments + presence of params first so
  // "projects/:id" wins over a hypothetical "projects" catch-all.
  const ranked = [...entries].sort((a, b) => {
    const sa = a.path.split('/').length
    const sb = b.path.split('/').length
    if (sa !== sb) return sb - sa
    const pa = (a.path.match(/:\w+/g)?.length ?? 0)
    const pb = (b.path.match(/:\w+/g)?.length ?? 0)
    return pa - pb
  })

  for (const entry of ranked) {
    // Patterns in manifests are without a leading slash ("services/:id");
    // matchPath expects a path-style pattern — normalize both sides.
    const pattern = entry.path.startsWith('/') ? entry.path : `/${entry.path}`
    const match = matchPath({ path: pattern, end: true }, relativePath)
    if (match) {
      return (
        <Suspense fallback={<LazyLoaderFallback />}>
          <AdminRouteParamsProvider params={match.params}>
            {entry.element}
          </AdminRouteParamsProvider>
        </Suspense>
      )
    }
  }

  return (
    <div className="p-10">
      <h1 className="font-heading text-2xl">Раздел не найден</h1>
      <p className="mt-2 text-sm text-zinc-500">Нет зарегистрированного экрана для «/{displayPath}».</p>

      <details className="mt-6 max-w-2xl rounded-lg border border-white/10 bg-white/5 p-4 text-xs text-zinc-400">
        <summary className="cursor-pointer text-zinc-300">Диагностика реестра модулей</summary>
        <div className="mt-3 space-y-2 font-mono">
          <div>Модулей зарегистрировано: <span className="text-zinc-200">{modules.length}</span></div>
          <div>Имена: <span className="text-zinc-200">{modules.map((m) => m.name).join(', ') || '—'}</span></div>
          <div>Blueprint keys: <span className="text-zinc-200">{Object.keys(blueprints).join(', ') || '—'}</span></div>
          <div>Screen paths ({screens.length}): <span className="text-zinc-200">{screens.map((s) => s.path).join(', ') || '—'}</span></div>
          <div>Искали совпадение для: <span className="text-zinc-200">«{relativePath}»</span></div>
        </div>
      </details>
    </div>
  )
}
