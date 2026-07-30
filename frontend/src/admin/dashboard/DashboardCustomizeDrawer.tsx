import { useState } from 'react'
import { Eye, EyeOff, GripVertical, RotateCcw, X } from 'lucide-react'
import type { DashboardWidgetDef, DashboardWidgetId } from './types'

type Props = {
  open: boolean
  onClose: () => void
  defs: DashboardWidgetDef[]
  order: DashboardWidgetId[]
  hidden: DashboardWidgetId[]
  unavailable: Set<DashboardWidgetId>
  onToggle: (id: DashboardWidgetId, hide: boolean) => void
  onMove: (from: number, to: number) => void
  onReset: () => void
}

export function DashboardCustomizeDrawer({
  open,
  onClose,
  defs,
  order,
  hidden,
  unavailable,
  onToggle,
  onMove,
  onReset,
}: Props) {
  const [dragId, setDragId] = useState<DashboardWidgetId | null>(null)
  const defMap = new Map(defs.map((d) => [d.id, d]))
  const availableOrder = order.filter((id) => !unavailable.has(id))

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50 backdrop-blur-[2px]" role="dialog" aria-modal>
      <button type="button" className="flex-1 cursor-default" aria-label="Закрыть" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-heading text-lg text-zinc-100">Настроить панель</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Перетащите, чтобы изменить порядок. Скрывайте виджеты, которые не нужны.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3 admin-quiet-scroll">
          {availableOrder.map((id) => {
            const def = defMap.get(id)
            if (!def) return null
            const isHidden = hidden.includes(id)
            return (
              <div
                key={id}
                draggable
                onDragStart={() => setDragId(id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!dragId || dragId === id) return
                  if (availableOrder.indexOf(dragId) < 0) return
                  const fullFrom = order.indexOf(dragId)
                  const fullTo = order.indexOf(id)
                  if (fullFrom >= 0 && fullTo >= 0) onMove(fullFrom, fullTo)
                  setDragId(null)
                }}
                className={`flex items-center gap-2 rounded-xl border px-2 py-2.5 ${
                  isHidden
                    ? 'border-white/5 bg-zinc-900/40 opacity-60'
                    : 'border-white/10 bg-zinc-900/80'
                } ${dragId === id ? 'opacity-50' : ''}`}
              >
                <span className="cursor-grab text-zinc-600 active:cursor-grabbing" title="Перетащить">
                  <GripVertical size={16} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{def.title}</p>
                  {def.hint ? <p className="truncate text-[11px] text-zinc-600">{def.hint}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => onToggle(id, !isHidden)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                  title={isHidden ? 'Показать' : 'Скрыть'}
                >
                  {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  {isHidden ? 'Показать' : 'Скрыть'}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          >
            <RotateCcw size={14} />
            Сбросить раскладку
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-teal-400/30 bg-teal-500/15 px-4 py-2 text-xs text-teal-100 hover:bg-teal-500/25"
          >
            Готово
          </button>
        </div>
      </aside>
    </div>
  )
}
