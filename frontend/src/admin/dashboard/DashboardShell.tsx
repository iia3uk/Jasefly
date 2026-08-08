import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { GripVertical, LayoutDashboard, SlidersHorizontal } from 'lucide-react'
import { usePluginEnabled, usePluginsHydrated } from '@/hooks/useApi'
import { getPackageDashboardCards } from '@/core/packageModuleLoader'
import { HostSlot } from '@/platform/hostSlots'
import { DASHBOARD_WIDGETS, DASHBOARD_WIDGET_MAP, spanClass } from './widgetRegistry'
import { useDashboardLayout } from './useDashboardLayout'
import { DashboardCustomizeDrawer } from './DashboardCustomizeDrawer'
import type { DashboardWidgetId } from './types'

/** Package dashboard cards are mutable — poll lightly for mount/unmount. */
function usePackageDashboardCards() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const id = window.setInterval(onStoreChange, 800)
      return () => window.clearInterval(id)
    },
    () => getPackageDashboardCards(),
    () => [],
  )
}

function useUnavailableIds(): Set<DashboardWidgetId> {
  const hydrated = usePluginsHydrated()
  const support = usePluginEnabled('support')
  const forms = usePluginEnabled('forms')
  const orders = usePluginEnabled('orders')
  const scheduler = usePluginEnabled('scheduler')
  const overload = usePluginEnabled('overload')
  const notifications = usePluginEnabled('notifications')
  const blog = usePluginEnabled('blog')

  return useMemo(() => {
    const set = new Set<DashboardWidgetId>()
    if (!hydrated) return set
    const gate: Record<string, boolean> = {
      support,
      forms,
      orders,
      scheduler,
      overload,
      notifications,
      blog,
    }
    for (const def of DASHBOARD_WIDGETS) {
      if (def.plugin && !gate[def.plugin]) set.add(def.id)
    }
    return set
  }, [
    hydrated,
    support,
    forms,
    orders,
    scheduler,
    overload,
    notifications,
    blog,
  ])
}

export function DashboardShell() {
  const unavailable = useUnavailableIds()
  const packageCards = usePackageDashboardCards()
  const { layout, setHidden, move, reset, isHidden } = useDashboardLayout(DASHBOARD_WIDGETS)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [dragId, setDragId] = useState<DashboardWidgetId | null>(null)

  const visibleIds = layout.order.filter(
    (id) => !isHidden(id) && !unavailable.has(id) && DASHBOARD_WIDGET_MAP[id],
  )
  const packageCardNodes: ReactNode[] = packageCards.map((card) => (
    <div key={`pkg-${card.id}`} className="col-span-1 min-w-0 lg:col-span-6">
      {card.render() as ReactNode}
    </div>
  ))

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className={
            editMode
              ? 'inline-flex items-center gap-1.5 rounded-full border border-teal-400/35 bg-teal-500/15 px-3.5 py-1.5 text-xs text-teal-100'
              : 'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/80 px-3.5 py-1.5 text-xs text-zinc-400 hover:border-white/20 hover:text-zinc-200'
          }
        >
          <LayoutDashboard size={13} aria-hidden />
          {editMode ? 'Готово' : 'Порядок'}
        </button>
        <button
          type="button"
          onClick={() => setCustomizeOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/80 px-3.5 py-1.5 text-xs text-zinc-300 transition hover:border-teal-400/30 hover:text-teal-100"
        >
          <SlidersHorizontal size={13} aria-hidden />
          Настроить панель
        </button>
      </div>

      {editMode ? (
        <p className="mt-2 text-xs text-zinc-500">
          Перетащите виджеты за ручку, чтобы изменить порядок. Полный список — в «Настроить панель».
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-6">
        {packageCardNodes}
        <div className="col-span-1 min-w-0 lg:col-span-6 empty:hidden">
          <HostSlot id="admin.dashboard" />
        </div>
        {visibleIds.map((id) => {
          const def = DASHBOARD_WIDGET_MAP[id]
          const Comp = def.Component
          return (
            <div
              key={id}
              className={`${spanClass(def.span)} relative min-w-0 ${
                editMode ? 'rounded-2xl ring-1 ring-dashed ring-white/15' : ''
              } ${dragId === id ? 'opacity-50' : ''}`}
              onDragOver={(e) => {
                if (editMode) e.preventDefault()
              }}
              onDrop={() => {
                if (!editMode || !dragId || dragId === id) return
                const from = layout.order.indexOf(dragId)
                const to = layout.order.indexOf(id)
                if (from >= 0 && to >= 0) move(from, to)
                setDragId(null)
              }}
            >
              {editMode ? (
                <div
                  draggable
                  onDragStart={() => setDragId(id)}
                  onDragEnd={() => setDragId(null)}
                  className="absolute left-2 top-2 z-10 inline-flex cursor-grab items-center gap-1 rounded-md border border-white/10 bg-zinc-950/90 px-1.5 py-1 text-[10px] text-zinc-400 active:cursor-grabbing"
                >
                  <GripVertical size={12} aria-hidden />
                  {def.title}
                </div>
              ) : null}
              <Comp />
            </div>
          )
        })}
      </div>

      {!visibleIds.length && !packageCards.length ? (
        <p className="mt-8 text-center text-sm text-zinc-500">
          Все виджеты скрыты. Откройте «Настроить панель», чтобы показать нужные.
        </p>
      ) : null}

      <DashboardCustomizeDrawer
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        defs={DASHBOARD_WIDGETS}
        order={layout.order}
        hidden={layout.hidden}
        unavailable={unavailable}
        onToggle={setHidden}
        onMove={move}
        onReset={reset}
      />
    </>
  )
}
