import type { ComponentType, ReactNode } from 'react'
import { createElement, Fragment, useCallback, useSyncExternalStore } from 'react'

/**
 * Universal host extension points for installable packages.
 * No product-slug knowledge — packages contribute by slot id.
 */
export type HostSlotId = 'site.body.end' | 'site.runtime' | 'admin.dashboard' | 'admin.header'

export type HostSlotContribution = {
  id: string
  slug: string
  slot: HostSlotId
  Component: ComponentType
  /** Cookie consent category required (e.g. "analytics", "marketing"). */
  requiresConsentCategory?: string
  order?: number
}

type Listener = () => void

const contributions = new Map<string, HostSlotContribution>()
const listeners = new Set<Listener>()
/** Bumped on every mutation so getSnapshot can return stable array identities. */
let storeVersion = 0
const EMPTY: HostSlotContribution[] = []
const snapshotCache = new Map<string, { version: number; items: HostSlotContribution[] }>()

function emit() {
  storeVersion += 1
  snapshotCache.clear()
  for (const l of listeners) l()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function sortedAll(): HostSlotContribution[] {
  return [...contributions.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
}

function cachedSnapshot(cacheKey: string, build: () => HostSlotContribution[]): HostSlotContribution[] {
  const hit = snapshotCache.get(cacheKey)
  if (hit && hit.version === storeVersion) return hit.items
  const items = build()
  const stable = items.length === 0 ? EMPTY : items
  snapshotCache.set(cacheKey, { version: storeVersion, items: stable })
  return stable
}

export function registerHostSlot(contribution: HostSlotContribution): () => void {
  const key = `${contribution.slug}:${contribution.id}`
  contributions.set(key, contribution)
  emit()
  return () => {
    contributions.delete(key)
    emit()
  }
}

export function clearHostSlotsForSlug(slug: string): void {
  let changed = false
  for (const [key, c] of contributions) {
    if (c.slug === slug) {
      contributions.delete(key)
      changed = true
    }
  }
  if (changed) emit()
}

export function listHostSlotContributions(slot?: HostSlotId): HostSlotContribution[] {
  if (!slot) {
    return cachedSnapshot('*', sortedAll)
  }
  return cachedSnapshot(slot, () => sortedAll().filter((c) => c.slot === slot))
}

/** React mount for a host slot — used by SiteLayout / admin shells. */
export function HostSlot({
  id,
  consentAllows,
}: {
  id: HostSlotId
  /** Optional gate: return true if category is allowed (or banner off). */
  consentAllows?: (category: string) => boolean
}): ReactNode {
  // Stable getSnapshot identity per slot id — required by useSyncExternalStore.
  const getSnapshot = useCallback(() => listHostSlotContributions(id), [id])
  const items = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
  if (!items.length) return null
  return createElement(
    Fragment,
    null,
    ...items.map((item) => {
      if (item.requiresConsentCategory && consentAllows && !consentAllows(item.requiresConsentCategory)) {
        return null
      }
      return createElement(item.Component, { key: `${item.slug}:${item.id}` })
    }),
  )
}
