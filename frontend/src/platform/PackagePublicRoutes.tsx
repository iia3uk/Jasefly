import { Suspense, useEffect, useState, type ReactElement } from 'react'
import { Route } from 'react-router-dom'
import { getPlatformPublicRoutes } from '@/platform/registry'
import { subscribePluginState } from '@/core/moduleRegistry'
import { LazyLoaderFallback } from '@/builder/public/CmsPages'
import { PackageErrorBoundary } from '@/platform/PackageErrorBoundary'

/**
 * Package public routes as plain <Route> elements.
 * Must be inlined under <Routes>/<Route> — custom wrappers break RR6
 * ("is not a <Route> component").
 */
export function usePackagePublicRouteElements(): ReactElement[] {
  const [, setTick] = useState(0)
  useEffect(() => subscribePluginState(() => setTick((n) => n + 1)), [])
  return getPlatformPublicRoutes().map((route) => (
    <Route
      key={`pkg-${route.path}`}
      path={route.path}
      element={
        <Suspense fallback={<LazyLoaderFallback />}>
          <PackageErrorBoundary slug={route.path.split('/').filter(Boolean)[0]} label={route.label}>
            <LazyPage loader={route.lazy} />
          </PackageErrorBoundary>
        </Suspense>
      }
    />
  ))
}

function LazyPage({ loader }: { loader: () => Promise<{ default: React.ComponentType<unknown> }> }) {
  const [Comp, setComp] = useState<React.ComponentType<unknown> | null>(null)
  useEffect(() => {
    let cancelled = false
    void loader().then((m) => {
      if (!cancelled) setComp(() => m.default)
    })
    return () => {
      cancelled = true
    }
  }, [loader])
  if (!Comp) return <LazyLoaderFallback />
  return <Comp />
}
