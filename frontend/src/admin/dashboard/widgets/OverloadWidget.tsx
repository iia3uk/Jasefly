import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui'
import { usePluginEnabled } from '@/hooks/useApi'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'
import { unpack, WidgetChrome } from './shared'
import { resourceTitle, t, useAdminLocale } from '@/admin/i18n'

type OverloadStatus = {
  available: boolean
  platform?: string
  load: { 1: number; 5: number; 15: number } | null
  load_per_core?: { 1: number; 5: number; 15: number } | null
  threshold_1m: number
  threshold_1m_absolute?: number
  cpus?: number
  overloaded: boolean
  quiet_until?: number | null
  mode: string
  stats: { total: number; last_24h: number; closed_24h: number }
  events: Array<{
    id: number
    load_1: number | string
    closed_site: number | boolean
    created_at?: string | null
  }>
}

export function OverloadWidget() {
  const { locale } = useAdminLocale()
  void locale
  const on = usePluginEnabled('overload')
  const q = useQuery({
    queryKey: ['dashboard-widget', 'overload'],
    enabled: on,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async () => unpack<OverloadStatus>(await api.get('/admin/overload/status', { silent: true })),
  })

  const data = q.data
  const overloaded = Boolean(data?.overloaded)

  return (
    <WidgetChrome
      title={resourceTitle('overload')}
      hint={
        !data?.available
          ? 'Load average unavailable'
          : overloaded
            ? t.overloadStateOver
            : 'Load average'
      }
      href={adminUrl('/overload')}
      icon={overloaded ? AlertTriangle : Activity}
      accent={overloaded ? 'rose' : 'emerald'}
    >
      {q.isLoading ? (
        <Skeleton className="h-24" />
      ) : !data?.available ? (
        <p className="text-sm text-zinc-500">
          {t.overloadUnavailable(data?.platform ?? '—')}
        </p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              { label: '1m', value: data.load?.[1] },
              { label: '5m', value: data.load?.[5] },
              { label: '15m', value: data.load?.[15] },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-white/[0.06] bg-black/25 px-2.5 py-2">
                <p className="text-[10px] text-zinc-500">{m.label}</p>
                <p className={`font-heading text-xl tabular-nums ${overloaded && m.label === '1m' ? 'text-rose-300' : 'text-zinc-50'}`}>
                  {m.value != null ? m.value.toFixed(2) : '—'}
                </p>
              </div>
            ))}
          </div>
          <p className="mb-2 text-[11px] text-zinc-600">
            {data.load_per_core
              ? `${data.load_per_core[1].toFixed(2)}/core · `
              : ''}
            threshold {Number(data.threshold_1m_absolute ?? data.threshold_1m).toFixed(1)}
            {data.cpus ? ` · ${data.cpus} CPU` : ''}
            {' · '}{t.overload24h}: {data.stats.last_24h}
            {data.stats.closed_24h ? ` · ${t.overloadClosed24h}: ${data.stats.closed_24h}` : ''}
            {data.quiet_until && data.quiet_until * 1000 > Date.now() ? ` · ${t.overloadStateQuiet}` : ''}
          </p>
          {(data.events ?? []).length ? (
            <ul className="space-y-1.5">
              {data.events.slice(0, 3).map((ev) => (
                <li key={ev.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-xs tabular-nums text-zinc-300">
                      load {Number(ev.load_1).toFixed(2)}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-500">
                      {Number(ev.closed_site) ? '503' : 'log'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    {ev.created_at ? formatMoscowDateTime(ev.created_at) : '—'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-300/80">{t.overloadEmpty}</p>
          )}
        </>
      )}
    </WidgetChrome>
  )
}
