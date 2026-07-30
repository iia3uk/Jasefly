import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, Mail, RefreshCw, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { t, useAdminLocale } from '@/admin/i18n'
import { Button, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { usePluginEnabled } from '@/hooks/useApi'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'

type OverloadEvent = {
  id: number
  load_1: number | string
  load_5?: number | string | null
  load_15?: number | string | null
  threshold: number | string
  mode: string
  closed_site: number | boolean
  notified: number | boolean
  note?: string | null
  created_at?: string | null
}

type OverloadStatus = {
  available: boolean
  platform: string
  cpus?: number
  normalize_by_cpu?: boolean
  require_sustained?: boolean
  load: { 1: number; 5: number; 15: number } | null
  load_per_core?: { 1: number; 5: number; 15: number } | null
  threshold_1m: number
  threshold_5m: number
  threshold_1m_absolute?: number
  threshold_5m_absolute?: number
  mode: string
  overloaded: boolean
  quiet_until?: number | null
  tripped: boolean
  last_trip_at?: number | null
  last_notify_at?: number | null
  retry_after: number
  error_message: string
  hint?: string
  stats: { total: number; last_24h: number; closed_24h: number }
  events: OverloadEvent[]
}

function overloadModeLabel(mode: string): string {
  const map: Record<string, string> = {
    block_notify: t.overloadModeBoth,
    block: t.overloadModeBlock,
    notify: t.overloadModeNotify,
    log: t.overloadModeLog,
  }
  return map[mode] ?? mode
}

function unpack<T>(v: { data?: T } | T): T {
  return (v && typeof v === 'object' && 'data' in (v as object))
    ? (v as { data: T }).data
    : (v as T)
}

export function OverloadPage() {
  const { locale } = useAdminLocale()
  void locale
  const client = useQueryClient()
  const on = usePluginEnabled('overload')
  const queryKey = ['admin', 'overload', 'status']
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    enabled: on,
    refetchInterval: 15_000,
    queryFn: async () => unpack<OverloadStatus>(await api.get('/admin/overload/status')),
  })

  const testNotify = useMutation({
    mutationFn: () => api.post('/admin/overload/test-notify', {}),
    onSuccess: (res) => {
      const d = unpack<{ sent?: boolean; recipients?: string[] }>(res as never)
      window.alert(
        d.sent
          ? `Тестовое письмо отправлено: ${(d.recipients ?? []).join(', ') || 'ок'}`
          : 'Не удалось отправить. Проверьте SMTP в плагине «Почта» и список email.',
      )
      void client.invalidateQueries({ queryKey })
    },
  })

  const clearEvents = useMutation({
    mutationFn: () => api.post('/admin/overload/clear-events', {}),
    onSuccess: () => void client.invalidateQueries({ queryKey }),
  })

  if (!on) {
    return (
      <GlassPanel className="p-6 text-sm text-zinc-400">
        {t.overloadDisabled}{' '}
        <Link className="text-teal-400 hover:underline" to={adminUrl('/plugins')}>{t.overloadDisabledLink}</Link>.
      </GlassPanel>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  const load = data.load
  const perCore = data.load_per_core
  const cpus = data.cpus ?? 0
  const abs1 = data.threshold_1m_absolute ?? data.threshold_1m
  const quiet = Boolean(data.quiet_until && data.quiet_until * 1000 > Date.now())
  const accent = data.overloaded ? 'rose' as const : 'teal' as const

  return (
    <div>
      <AdminPageHero
        title={t.overloadTitle}
        hint={t.overloadHint}
        eyebrow={t.overloadEyebrow}
        accent={accent}
        actions={
          <>
            <GhostButton type="button" disabled={isFetching} onClick={() => void refetch()}>
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> {t.overloadRefresh}
            </GhostButton>
            <Button type="button" disabled={testNotify.isPending} onClick={() => testNotify.mutate()}>
              <Mail size={14} /> {t.overloadTestEmail}
            </Button>
          </>
        }
      />

      {!data.available && (
        <GlassPanel className="mb-4 border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t.overloadUnavailable(data.platform)}</p>
          </div>
        </GlassPanel>
      )}

      {data.available && (
        <GlassPanel className="mb-4 border-sky-500/20 bg-sky-500/5 p-4 text-sm text-sky-100/90">
          <p className="font-medium text-sky-100">{t.overloadWhyTitle}</p>
          <p className="mt-1.5 text-sky-100/75">
            {data.hint
              || 'На shared-хостинге sys_getloadavg показывает нагрузку всего сервера (соседи + ваш аккаунт), а не только сайта. '
                + 'MCP ZIP-апдейт даёт короткий всплеск — он глушится окном тишины.'}
          </p>
          <p className="mt-2 text-xs text-sky-200/60">
            CPU: {cpus || '—'}
            {data.normalize_by_cpu ? ' · порог на ядро' : ' · абсолютный порог'}
            {data.require_sustained ? ' · нужна устойчивость 1m+5m' : ''}
            {quiet && data.quiet_until
              ? t.overloadQuietUntil(formatMoscowDateTime(new Date(data.quiet_until * 1000).toISOString()))
              : ''}
          </p>
        </GlassPanel>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Load 1m',
            value: load ? load[1].toFixed(2) : '—',
            sub: perCore
              ? t.overloadPerCore(perCore[1].toFixed(2), abs1.toFixed(1))
              : `threshold ${abs1}`,
          },
          {
            label: 'Load 5m',
            value: load ? load[5].toFixed(2) : '—',
            sub: data.require_sustained
              ? t.overloadSustained((data.threshold_5m_absolute ?? 0).toFixed(1))
              : data.threshold_5m > 0
                ? `threshold ${data.threshold_5m_absolute ?? data.threshold_5m}`
                : '—',
          },
          { label: 'Load 15m', value: load ? load[15].toFixed(2) : '—', sub: t.overloadRef },
          {
            label: 'State',
            value: quiet ? t.overloadStateQuiet : data.overloaded ? t.overloadStateOver : t.overloadStateOk,
            sub: overloadModeLabel(data.mode),
            danger: data.overloaded,
          },
        ].map((card) => (
          <GlassPanel key={card.label} className="p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">{card.label}</p>
            <p className={`mt-1 font-heading text-2xl tabular-nums ${card.danger ? 'text-rose-300' : 'text-zinc-50'}`}>
              {card.value}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{card.sub}</p>
          </GlassPanel>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">{t.overloadTotal}</p>
          <p className="mt-1 font-heading text-xl tabular-nums">{data.stats.total}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">{t.overload24h}</p>
          <p className="mt-1 font-heading text-xl tabular-nums">{data.stats.last_24h}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">{t.overloadClosed24h}</p>
          <p className="mt-1 font-heading text-xl tabular-nums">{data.stats.closed_24h}</p>
        </GlassPanel>
      </div>

      <GlassPanel className="mb-4 p-4 text-sm text-zinc-400">
        <p className="mb-1 font-medium text-zinc-200">{t.overload503}</p>
        <p>{data.error_message || '—'}</p>
        <p className="mt-2 text-xs text-zinc-600">
          Retry-After: {data.retry_after}s ·{' '}
          <Link className="text-teal-400 hover:underline" to={adminUrl('/plugins')}>{t.overloadDisabledLink}</Link>
        </p>
      </GlassPanel>

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-medium text-zinc-100">
          <Activity className="h-4 w-4 text-teal-400" />
          {t.overloadJournal}
        </h2>
        <GhostButton
          type="button"
          className="text-rose-300/80"
          disabled={!data.events.length || clearEvents.isPending}
          onClick={() => {
            if (confirm(t.overloadClearConfirm)) clearEvents.mutate()
          }}
        >
          <Trash2 size={14} /> {t.overloadClear}
        </GhostButton>
      </div>

      {data.events.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">{t.overloadEmpty}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">{t.overloadColTime}</th>
                <th className="px-3 py-2 font-medium">{t.overloadColLoad}</th>
                <th className="px-3 py-2 font-medium">{t.overloadColThreshold}</th>
                <th className="px-3 py-2 font-medium">{t.overloadColMode}</th>
                <th className="px-3 py-2 font-medium">{t.overloadColActions}</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((ev) => (
                <tr key={ev.id} className="border-t border-white/[0.04]">
                  <td className="px-3 py-2 text-zinc-300">
                    {ev.created_at ? formatMoscowDateTime(ev.created_at) : '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-zinc-200">
                    {Number(ev.load_1).toFixed(2)} / {Number(ev.load_5 ?? 0).toFixed(2)} / {Number(ev.load_15 ?? 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-400">{Number(ev.threshold).toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-400">{overloadModeLabel(ev.mode)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {Number(ev.closed_site) ? '503 ' : ''}
                    {Number(ev.notified) ? 'email' : Number(ev.closed_site) ? '' : 'log'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
