import { useQuery } from '@tanstack/react-query'
import { Timer } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui'
import { usePluginEnabled } from '@/hooks/useApi'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'
import { unpack, WidgetChrome } from './shared'

type SchedulerStats = {
  by_status: Array<{ status: string; c: number }>
  last_tick_at?: string | null
  cron_stale: boolean
}

type JobRow = {
  id: number
  type: string
  status: string
  last_error?: string | null
  created_at?: string | null
}

const STATUS_RU: Record<string, string> = {
  pending: 'Ожидает',
  running: 'Выполняется',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
}

export function SchedulerWidget() {
  const on = usePluginEnabled('scheduler')
  const stats = useQuery({
    queryKey: ['dashboard-widget', 'scheduler-stats'],
    enabled: on,
    staleTime: 30_000,
    queryFn: async () => unpack<SchedulerStats>(await api.get('/admin/scheduler/stats')),
  })
  const jobs = useQuery({
    queryKey: ['dashboard-widget', 'scheduler-jobs'],
    enabled: on,
    staleTime: 30_000,
    queryFn: async () => unpack<JobRow[]>(await api.get('/admin/scheduler/jobs?status=failed')),
  })

  const countOf = (status: string) =>
    stats.data?.by_status?.find((r) => r.status === status)?.c ?? 0

  return (
    <WidgetChrome
      title="Планировщик"
      hint={stats.data?.cron_stale ? 'Cron давно не тикал' : 'Очередь фоновых задач'}
      href={adminUrl('/scheduler')}
      icon={Timer}
      accent={stats.data?.cron_stale ? 'rose' : 'sky'}
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          { label: 'Ожидают', value: countOf('pending') },
          { label: 'В работе', value: countOf('running') },
          { label: 'Ошибки', value: countOf('failed') },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-white/[0.06] bg-black/25 px-2.5 py-2">
            <p className="text-[10px] text-zinc-500">{m.label}</p>
            <p className="font-heading text-xl tabular-nums text-zinc-50">
              {stats.isLoading ? '—' : m.value}
            </p>
          </div>
        ))}
      </div>
      <p className="mb-2 text-[11px] text-zinc-600">
        Последний tick:{' '}
        {stats.data?.last_tick_at
          ? formatMoscowDateTime(stats.data.last_tick_at)
          : '—'}
      </p>
      {jobs.isLoading ? (
        <Skeleton className="h-20" />
      ) : (jobs.data ?? []).length ? (
        <ul className="space-y-1.5">
          {(jobs.data ?? []).slice(0, 4).map((j) => (
            <li key={j.id} className="rounded-lg border border-rose-400/15 bg-rose-500/5 px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate font-mono text-xs text-zinc-300">{j.type}</span>
                <span className="shrink-0 text-[10px] text-rose-300/80">
                  {STATUS_RU[j.status] ?? j.status}
                </span>
              </div>
              {j.last_error ? (
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">{j.last_error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-emerald-300/80">Недавних ошибок нет</p>
      )}
    </WidgetChrome>
  )
}
