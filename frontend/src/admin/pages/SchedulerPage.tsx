import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, BookOpen, ChevronDown, Loader2, Play, RefreshCw, RotateCcw, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { Button, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { useAuth } from '@/context/AuthContext'
import { usePluginEnabled } from '@/hooks/useApi'
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

/** Known job types → human explanation (admin help). */
const HANDLER_HELP: Record<string, { title: string; source: string }> = {
  'scheduler.noop': {
    title: 'Пустая проверка (noop)',
    source: 'Служебно / тест пульса очереди',
  },
  'scheduler.cleanup': {
    title: 'Очистка старых записей очереди',
    source: 'Сам планировщик (по cron / tick)',
  },
  'platform.event.dispatch': {
    title: 'Отложенное событие платформы',
    source: 'SDK EventsAdapter::publishLater',
  },
}

function SchedulerHelp({ handlers }: { handlers: string[] }) {
  const [open, setOpen] = useState(false)
  const known = handlers.length
    ? handlers
    : Object.keys(HANDLER_HELP)

  return (
    <GlassPanel className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-100">
          <BookOpen className="h-4 w-4 text-emerald-400" />
          Как пользоваться планировщиком
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-5 border-t border-zinc-800 px-4 py-4 text-sm leading-relaxed text-zinc-300">
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Зачем он</h2>
            <p>
              Это <strong className="font-medium text-zinc-100">очередь фоновых задач</strong>, а не календарь
              «создай напоминание». Модули кладут работу «на потом» (пауза в автоматизации, рассылка, очистка),
              а <strong className="font-medium text-zinc-100">tick</strong> периодически забирает и выполняет порцию.
            </p>
            <p className="text-zinc-400">
              Пустой список задач при Cron health OK — нормально: сейчас просто нечего выполнять.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Как работать из этой страницы</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-zinc-300">
              <li>
                Смотрите <strong className="text-zinc-100">Cron health</strong>: OK и свежий last tick — очередь крутится.
                Stale — задачи копятся, настройте cron или жмите «Tick сейчас».
              </li>
              <li>
                <strong className="text-zinc-100">Tick сейчас</strong> — ручной прогон (до ~10 задач). Удобно на shared-хостинге без cron.
              </li>
              <li>
                Откройте задачу слева → справа детали, payload, ошибка.
                При ошибке: <strong className="text-zinc-100">Retry</strong> или <strong className="text-zinc-100">Cancel</strong>.
              </li>
              <li>
                Фильтры статусов — очередь / ошибки / готовые.
              </li>
            </ol>
            <p className="rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-400">
              php api/bin/scheduler.php run --limit=20
              <span className="mt-1 block font-sans text-zinc-500">
                Рекомендуемый cron на хостинге: раз в 1–5 минут. Без cron tick бывает при заходе в админку (lazy).
              </span>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Откуда берутся задачи</h2>
            <p>
              <strong className="text-zinc-100">Вручную из этого экрана создать задачу нельзя</strong> — здесь только мониторинг.
              Задачи появляются сами, когда модули или SDK кладут их в очередь:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Пакетные модули (автоматизации, рассылки, аналитика и др.) — кладут namespaced jobs
                через Platform Scheduler API (локальный тип → <code className="text-zinc-200">{'{slug}.{type}'}</code>)
              </li>
              <li>
                Таблица <code className="text-zinc-200">cron_schedules</code> — периодические задания (если строки добавлены в БД)
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Типы задач (handlers)</h2>
            <p className="text-zinc-400">
              Блок Handlers выше — не «ваши задания», а типы, которые система <em>умеет</em> выполнять прямо сейчас
              (зависит от включённых модулей).
            </p>
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full min-w-[36rem] text-left text-xs">
                <thead className="bg-zinc-900/80 text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Тип</th>
                    <th className="px-3 py-2 font-medium">Что делает</th>
                    <th className="px-3 py-2 font-medium">Откуда</th>
                  </tr>
                </thead>
                <tbody>
                  {known.map((type) => {
                    const meta = HANDLER_HELP[type]
                    return (
                      <tr key={type} className="border-t border-zinc-800/80">
                        <td className="px-3 py-2 font-mono text-emerald-300/90">{type}</td>
                        <td className="px-3 py-2 text-zinc-300">{meta?.title || 'Обработчик модуля / пакета'}</td>
                        <td className="px-3 py-2 text-zinc-500">{meta?.source || 'Зарегистрирован при boot модуля'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Как писать свои задачи (для разработчика)</h2>
            <p>
              1) Зарегистрировать handler при boot модуля.
              2) Положить job в очередь через <code className="text-zinc-200">JobQueue</code> или Platform SDK.
            </p>
            <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-zinc-300">{`// 1) В Module::boot()
JobHandlerRegistry::register('my.module.work', static function (array $payload): void {
    // ваша логика; $payload — JSON из очереди
});

// 2) Когда нужна фоновая работа
$queue = new JobQueue($db);
$queue->push('my.module.work', ['id' => 42]);           // сразу
$queue->delay('my.module.work', ['id' => 42], 300);     // через 5 минут

// Platform SDK (пакетный модуль)
$scheduler->enqueue('my.module.work', ['id' => 42]);`}</pre>
            <p className="text-xs text-zinc-500">
              Файлы: <code className="text-zinc-400">backend/src/Modules/Scheduler/JobQueue.php</code>,{' '}
              <code className="text-zinc-400">JobHandlerRegistry.php</code>, CLI{' '}
              <code className="text-zinc-400">api/bin/scheduler.php</code>. Документация:{' '}
              <code className="text-zinc-400">docs/modules/scheduler.md</code>.
            </p>
          </section>
        </div>
      ) : null}
    </GlassPanel>
  )
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
  const pluginOn = usePluginEnabled('scheduler')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const stats = useQuery({
    queryKey: ['admin', 'scheduler', 'stats'],
    enabled: pluginOn,
    queryFn: async () => asData<SchedulerStats>(await api.get('/admin/scheduler/stats')),
    refetchInterval: pluginOn ? 8000 : false,
  })

  const jobs = useQuery({
    queryKey: ['admin', 'scheduler', 'jobs', status],
    enabled: pluginOn,
    queryFn: async () => {
      const q = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`
      return asData<JobRow[]>(await api.get(`/admin/scheduler/jobs${q}`))
    },
    refetchInterval: pluginOn ? 5000 : false,
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
      <AdminPageHero
        title="Планировщик"
        hint="Диспетчерская фоновых задач: мониторинг очереди и tick. Создавать задачи здесь нельзя — их кладут модули."
        eyebrow="Система"
        accent="amber"
        actions={
          <>
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
          </>
        }
      />

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

      <SchedulerHelp handlers={stats.data?.handlers ?? []} />

      {stats.data?.handlers?.length ? (
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Handlers (зарегистрированы сейчас)</p>
          <p className="mt-1 text-xs text-zinc-500">Типы, которые система умеет выполнять — не список ваших заданий в очереди.</p>
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
