import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, Loader2, Play, RefreshCw, RotateCcw, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { useAuth } from '@/context/AuthContext'

type JobRow = {
  id: number
  type: string
  queue: string
  priority: number
  status: string
  available_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  attempts: number
  max_attempts: number
  last_error?: string | null
  deduplication_key?: string | null
  created_at?: string | null
  payload_preview?: Record<string, unknown> | null
}

type SchedulerStats = {
  by_status: Array<{ status: string; c: number }>
  by_queue: Array<{ queue: string; status: string; c: number }>
  last_tick_at?: string | null
  cron_stale: boolean
  handlers: string[]
}

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает',
  running: 'Выполняется',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
}

export function SchedulerPage() {
  return (
    <RequirePermission permission="scheduler.view">
      <SchedulerInner />
    </RequirePermission>
  )
}

function SchedulerInner() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const canManage = can('scheduler.manage')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const stats = useQuery({
    queryKey: ['admin', 'scheduler', 'stats'],
    queryFn: async () => asData<SchedulerStats>(await api.get('/admin/scheduler/stats')),
    refetchInterval: 8000,
  })

  const jobs = useQuery({
    queryKey: ['admin', 'scheduler', 'jobs', status],
    queryFn: async () => {
      const q = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`
      return asData<JobRow[]>(await api.get(`/admin/scheduler/jobs${q}`))
    },
    refetchInterval: 5000,
  })

  const tick = useMutation({
    mutationFn: () => api.post('/admin/scheduler/tick', { limit: 10 }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'scheduler'] })
    },
  })

  const retry = useMutation({
    mutationFn: (id: number) => api.post(`/admin/scheduler/jobs/${id}/retry`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'scheduler'] })
    },
  })

  const cancel = useMutation({
    mutationFn: (id: number) => api.post(`/admin/scheduler/jobs/${id}/cancel`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'scheduler'] })
    },
  })

  const rows = jobs.data ?? []
  const selected = rows.find((j) => j.id === selectedId) ?? null
  const statusFilters = useMemo(
    () => ['all', 'pending', 'running', 'failed', 'completed', 'cancelled'],
    [],
  )

  const byStatus = stats.data?.by_status ?? []
  const totalJobs = byStatus.reduce((sum, row) => sum + Number(row.c || 0), 0)
  const pendingCount = byStatus.find((r) => r.status === 'pending')?.c ?? 0
  const failedCount = byStatus.find((r) => r.status === 'failed')?.c ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl text-white">Планировщик</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Очередь фоновых задач. Cron: CLI или lazy tick при входе в админку.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton
            type="button"
            onClick={() => void qc.invalidateQueries({ queryKey: ['admin', 'scheduler'] })}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Обновить
          </GhostButton>
          {canManage ? (
            <Button
              type="button"
              className="admin-primary"
              disabled={tick.isPending}
              onClick={() => tick.mutate()}
            >
              {tick.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              Tick сейчас
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Всего задач</p>
          <p className="mt-1 text-2xl text-white">{totalJobs}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">В очереди</p>
          <p className="mt-1 text-2xl text-amber-300">{pendingCount}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Ошибки</p>
          <p className="mt-1 text-2xl text-red-300">{failedCount}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Cron health</p>
          <div className="mt-1 flex items-center gap-2">
            {stats.isLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : stats.data?.cron_stale ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <span className="text-amber-300">Stale</span>
              </>
            ) : (
              <>
                <Activity className="h-5 w-5 text-emerald-400" />
                <span className="text-emerald-300">OK</span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            last tick: {stats.data?.last_tick_at || '—'}
          </p>
        </GlassPanel>
      </div>

      {stats.data?.handlers?.length ? (
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Handlers</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stats.data.handlers.map((h) => (
              <code key={h} className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">{h}</code>
            ))}
          </div>
        </GlassPanel>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {statusFilters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs ${
              status === s ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {s === 'all' ? 'Все' : STATUS_LABEL[s] || s}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <GlassPanel className="max-h-[70vh] overflow-y-auto p-2">
          {jobs.isLoading ? <Skeleton className="m-2 h-40" /> : null}
          {!jobs.isLoading && !rows.length ? (
            <p className="p-4 text-sm text-zinc-500">Задач нет</p>
          ) : null}
          {rows.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => setSelectedId(j.id)}
              className={`mb-1 w-full rounded-xl px-3 py-2 text-left transition ${
                selectedId === j.id ? 'bg-zinc-800' : 'hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-zinc-400">#{j.id}</span>
                <span className="shrink-0 text-[10px] uppercase text-zinc-500">
                  {STATUS_LABEL[j.status] || j.status}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-zinc-200">{j.type}</p>
              <p className="mt-0.5 truncate text-xs text-zinc-500">{j.queue} · попытка {j.attempts}/{j.max_attempts}</p>
            </button>
          ))}
        </GlassPanel>

        <GlassPanel className="flex max-h-[70vh] flex-col p-0">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-zinc-500">
              <Activity className="h-8 w-8" />
              <p className="text-sm">Выберите задачу</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-zinc-400">#{selected.id}</div>
                  <div className="mt-1 text-sm font-medium text-zinc-100">{selected.type}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {selected.queue} · priority {selected.priority}
                  </div>
                  {selected.deduplication_key ? (
                    <div className="mt-1 truncate font-mono text-[10px] text-zinc-600">{selected.deduplication_key}</div>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    {(selected.status === 'failed' || selected.status === 'cancelled') ? (
                      <GhostButton
                        type="button"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(selected.id)}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Retry
                      </GhostButton>
                    ) : null}
                    {(selected.status === 'pending' || selected.status === 'running') ? (
                      <GhostButton
                        type="button"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate(selected.id)}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        Cancel
                      </GhostButton>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-zinc-500">Создана</p>
                    <p className="text-zinc-200">{selected.created_at || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Доступна</p>
                    <p className="text-zinc-200">{selected.available_at || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Старт</p>
                    <p className="text-zinc-200">{selected.started_at || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Финиш</p>
                    <p className="text-zinc-200">{selected.finished_at || '—'}</p>
                  </div>
                </div>
                {selected.last_error ? (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                    <p className="text-xs uppercase text-red-300">Ошибка</p>
                    <pre className="mt-1 whitespace-pre-wrap text-xs text-red-100">{selected.last_error}</pre>
                  </div>
                ) : null}
                {selected.payload_preview ? (
                  <div>
                    <p className="text-xs text-zinc-500">Payload</p>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-300">
                      {JSON.stringify(selected.payload_preview, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </GlassPanel>
      </div>
    </div>
  )
}
