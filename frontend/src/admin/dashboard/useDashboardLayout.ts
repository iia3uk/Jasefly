import { useCallback, useMemo, useState } from 'react'
import {
  clearDashboardLayout,
  readDashboardLayout,
  writeDashboardLayout,
} from '@/admin/lib/prefs'
import type { DashboardLayoutPrefs, DashboardWidgetDef, DashboardWidgetId } from './types'

function mergeLayout(
  defs: DashboardWidgetDef[],
  stored: { order: string[]; hidden: string[] } | null,
): DashboardLayoutPrefs {
  const known = new Set(defs.map((d) => d.id))
  const defaultOrder = defs.map((d) => d.id)
  const defaultHidden = defs.filter((d) => !d.defaultVisible).map((d) => d.id)

  if (!stored) {
    return { order: defaultOrder, hidden: defaultHidden }
  }

  const orderSeen = new Set<DashboardWidgetId>()
  const order: DashboardWidgetId[] = []
  for (const id of stored.order) {
    if (!known.has(id as DashboardWidgetId)) continue
    const wid = id as DashboardWidgetId
    if (orderSeen.has(wid)) continue
    orderSeen.add(wid)
    order.push(wid)
  }
  for (const id of defaultOrder) {
    if (!orderSeen.has(id)) order.push(id)
  }

  const hiddenKnown = new Set(
    stored.hidden.filter((id): id is DashboardWidgetId => known.has(id as DashboardWidgetId)),
  )
  // Newly added widgets (not in stored.order) follow defaultVisible
  for (const d of defs) {
    if (!stored.order.includes(d.id) && !d.defaultVisible) {
      hiddenKnown.add(d.id)
    }
  }

  return { order, hidden: [...hiddenKnown] }
}

export function useDashboardLayout(defs: DashboardWidgetDef[]) {
  const [tick, setTick] = useState(0)

  const layout = useMemo(() => {
    void tick
    return mergeLayout(defs, readDashboardLayout())
  }, [defs, tick])

  const persist = useCallback((next: DashboardLayoutPrefs) => {
    writeDashboardLayout(next)
    setTick((n) => n + 1)
  }, [])

  const setOrder = useCallback(
    (order: DashboardWidgetId[]) => {
      persist({ ...layout, order })
    },
    [layout, persist],
  )

  const setHidden = useCallback(
    (id: DashboardWidgetId, hidden: boolean) => {
      const set = new Set(layout.hidden)
      if (hidden) set.add(id)
      else set.delete(id)
      persist({ ...layout, hidden: [...set] })
    },
    [layout, persist],
  )

  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
      const next = [...layout.order]
      if (fromIndex >= next.length || toIndex >= next.length) return
      const [item] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, item)
      persist({ ...layout, order: next })
    },
    [layout, persist],
  )

  const reset = useCallback(() => {
    clearDashboardLayout()
    setTick((n) => n + 1)
  }, [])

  const isHidden = useCallback(
    (id: DashboardWidgetId) => layout.hidden.includes(id),
    [layout.hidden],
  )

  return { layout, setOrder, setHidden, move, reset, isHidden }
}
