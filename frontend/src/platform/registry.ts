import type { ComponentType, ReactElement, ReactNode } from 'react'
import type { PublicRouteDef } from '@/core/pluginTypes'
import { clearHostSlotsForSlug } from '@/platform/hostSlots'

type Scoped = { slug: string }

const topBarButtons: Array<Scoped & { id: string; label: string; onClick: () => void }> = []
const searchProviders: Array<Scoped & { id: string; label: string; search: (q: string) => Promise<Array<{ title: string; href: string }>> }> = []
const propertyEditors = new Map<string, { slug: string; editor: ComponentType<{ value: unknown; onChange: (v: unknown) => void }> }>()
const inspectorPanels: Array<Scoped & { id: string; label: string; render: () => ReactElement }> = []
const toolbarActions: Array<Scoped & { id: string; label: string; run: () => void }> = []
const contextMenuItems: Array<Scoped & { id: string; label: string; run: () => void }> = []
const blockPresets: Array<Scoped & { id: string; label: string; blocks: unknown[] }> = []
const categories = new Set<string>()
const pathGates: Array<{ slug: string; prefix: string }> = []
const dashboardCards: Array<Scoped & { id: string; label: string; render: () => ReactNode }> = []
const publicRoutes: Array<Scoped & PublicRouteDef> = []
const unregisterFns = new Map<string, Array<() => void>>()

export function trackUnregister(slug: string, fn: () => void): void {
  const list = unregisterFns.get(slug) ?? []
  list.push(fn)
  unregisterFns.set(slug, list)
}

export function unregisterPlatformModule(slug: string): void {
  for (const fn of unregisterFns.get(slug) ?? []) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
  unregisterFns.delete(slug)
  clearHostSlotsForSlug(slug)
  for (let i = topBarButtons.length - 1; i >= 0; i--) if (topBarButtons[i].slug === slug) topBarButtons.splice(i, 1)
  for (let i = searchProviders.length - 1; i >= 0; i--) if (searchProviders[i].slug === slug) searchProviders.splice(i, 1)
  for (let i = inspectorPanels.length - 1; i >= 0; i--) if (inspectorPanels[i].slug === slug) inspectorPanels.splice(i, 1)
  for (let i = toolbarActions.length - 1; i >= 0; i--) if (toolbarActions[i].slug === slug) toolbarActions.splice(i, 1)
  for (let i = contextMenuItems.length - 1; i >= 0; i--) if (contextMenuItems[i].slug === slug) contextMenuItems.splice(i, 1)
  for (let i = blockPresets.length - 1; i >= 0; i--) if (blockPresets[i].slug === slug) blockPresets.splice(i, 1)
  for (let i = pathGates.length - 1; i >= 0; i--) if (pathGates[i].slug === slug) pathGates.splice(i, 1)
  for (let i = dashboardCards.length - 1; i >= 0; i--) if (dashboardCards[i].slug === slug) dashboardCards.splice(i, 1)
  for (let i = publicRoutes.length - 1; i >= 0; i--) if (publicRoutes[i].slug === slug) publicRoutes.splice(i, 1)
  for (const [k, v] of propertyEditors) if (v.slug === slug) propertyEditors.delete(k)
}

/** Test helper: count scoped FE registrations for a slug. */
export function countPlatformRegistrations(slug: string): number {
  let n = 0
  n += topBarButtons.filter((x) => x.slug === slug).length
  n += searchProviders.filter((x) => x.slug === slug).length
  n += inspectorPanels.filter((x) => x.slug === slug).length
  n += toolbarActions.filter((x) => x.slug === slug).length
  n += contextMenuItems.filter((x) => x.slug === slug).length
  n += blockPresets.filter((x) => x.slug === slug).length
  n += pathGates.filter((x) => x.slug === slug).length
  n += dashboardCards.filter((x) => x.slug === slug).length
  n += publicRoutes.filter((x) => x.slug === slug).length
  for (const v of propertyEditors.values()) if (v.slug === slug) n++
  return n
}

export const platformRegistry = {
  topBarButtons,
  searchProviders,
  propertyEditors,
  inspectorPanels,
  toolbarActions,
  contextMenuItems,
  blockPresets,
  categories,
  pathGates,
  dashboardCards,
  publicRoutes,
}

export function getPlatformPublicRoutes(): PublicRouteDef[] {
  return publicRoutes.map(({ slug: _s, ...route }) => route)
}

export function getPlatformDashboardCards() {
  return dashboardCards
}

export function isPathGatedByPackage(pathname: string): string | null {
  for (const g of pathGates) {
    if (pathname === g.prefix || pathname.startsWith(g.prefix + '/')) return g.slug
  }
  return null
}
