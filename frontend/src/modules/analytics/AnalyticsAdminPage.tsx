import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Eye, MousePointerClick, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { usePluginEnabled } from '@/hooks/useApi'
import { adminUrl } from '@/admin/adminBasePath'
import { AreaChart, BarRow, Sparkline, trendPct, type DailyPoint } from './AnalyticsCharts'

type Overview = {
  range: { from: string; to: string }
  summary: {
    events: number
    visitors: number
    sessions: number
    page_views: number
    value_total: number
  }
  daily: DailyPoint[]
  events: Array<{ event_name: string; count: number; visitors: number; value: number }>
  pages: Array<{ path: string; views: number; visitors: number }>
  goals: Array<{ id: number; name: string; conversions: number; value: number }>
}

const unpack = <T,>(v: { data?: T } | T): T =>
  (v && typeof v === 'object' && 'data' in v ? (v as { data: T }).data : v as T)

function isoDate(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

const PRESETS: Array<{ label: string; from: number }> = [
  { label: '7 дней', from: -6 },
  { label: '30 дней', from: -29 },
  { label: '90 дней', from: -89 },
]

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null
  const up = pct > 0
  const flat = pct === 0
  return (
    <span
      className={
        flat
          ? 'text-zinc-500'
          : up
            ? 'text-emerald-400/90'
            : 'text-rose-400/90'
      }
    >
      {flat ? '±0%' : `${up ? '+' : ''}${pct}%`}
      <span className="ml-1 text-zinc-600">vs 1-я пол. периода</span>
    </span>
  )
}

export function AnalyticsAdminPage() {
  return (
    <RequirePermission permission="analytics.view">
      <AnalyticsInner />
    </RequirePermission>
  )
}

function AnalyticsInner() {
  const pluginOn = usePluginEnabled('analytics')
  const [from, setFrom] = useState(isoDate(-29))
  const [to, setTo] = useState(isoDate())
  const [metric, setMetric] = useState<'page_views' | 'visitors' | 'events'>('page_views')

  const overview = useQuery({
    queryKey: ['analytics', from, to],
    enabled: pluginOn,
    queryFn: async () =>
      unpack<Overview>(await api.get(`/admin/analytics/overview?from=${from}&to=${to}`)),
  })
  const data = overview.data
  const daily = data?.daily ?? []

  const cards = useMemo(() => {
    const s = data?.summary
    return [
      {
        key: 'page_views' as const,
        label: 'Просмотры',
        value: s?.page_views ?? 0,
        icon: Eye,
        stroke: 'rgb(45 212 191)',
        fill: 'rgb(45 212 191 / 0.2)',
      },
      {
        key: 'visitors' as const,
        label: 'Посетители',
        value: s?.visitors ?? 0,
        icon: Users,
        stroke: 'rgb(251 191 36)',
        fill: 'rgb(251 191 36 / 0.18)',
      },
      {
        key: 'sessions' as const,
        label: 'Сессии',
        value: s?.sessions ?? 0,
        icon: MousePointerClick,
        stroke: 'rgb(56 189 248)',
        fill: 'rgb(56 189 248 / 0.18)',
      },
      {
        key: 'events' as const,
        label: 'События',
        value: s?.events ?? 0,
        icon: Activity,
        stroke: 'rgb(167 139 250)',
        fill: 'rgb(167 139 250 / 0.16)',
      },
    ]
  }, [data?.summary])

  if (!pluginOn) {
    return (
      <GlassPanel className="p-6 text-sm text-zinc-400">
        Модуль «Аналитика» выключен. Включите в{' '}
        <Link to={adminUrl('/plugins')} className="text-emerald-400 hover:underline">Плагинах</Link>.
      </GlassPanel>
    )
  }

  const maxPage = Math.max(1, ...(data?.pages ?? []).map((p) => p.views))
  const maxEvent = Math.max(1, ...(data?.events ?? []).map((e) => e.count))
  const metricLabel =
    metric === 'page_views' ? 'просмотры' : metric === 'visitors' ? 'посетители' : 'события'

  return (
    <div className="space-y-5">
      <AdminPageHero
        title="Аналитика"
        hint="События сайта без хранения исходных IP. Beacon на публичных страницах пишет в эту сводку."
        eyebrow="Трафик"
        accent="emerald"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setFrom(isoDate(p.from))
                  setTo(isoDate())
                }}
                className="rounded-full border border-white/10 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-300 transition hover:border-teal-400/30 hover:text-teal-100"
              >
                {p.label}
              </button>
            ))}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
            />
            <span className="text-zinc-600">—</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
            />
          </div>
        }
      />

      {/* Hero pulse */}
      <GlassPanel className="relative overflow-hidden p-0">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(ellipse 70% 80% at 12% -20%, rgb(45 212 191 / 0.14), transparent 55%), radial-gradient(ellipse 50% 60% at 90% 110%, rgb(251 191 36 / 0.08), transparent 50%)',
          }}
          aria-hidden
        />
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-teal-300/80">Пульс трафика</p>
              <h2 className="mt-1 font-heading text-lg text-zinc-100">
                {metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1)} по дням
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                <TrendBadge pct={trendPct(daily, metric)} />
              </p>
            </div>
            <div className="flex gap-1 rounded-full border border-white/10 bg-black/30 p-0.5">
              {(
                [
                  ['page_views', 'Просмотры'],
                  ['visitors', 'Люди'],
                  ['events', 'События'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMetric(key)}
                  className={
                    metric === key
                      ? 'rounded-full bg-teal-500/20 px-3 py-1 text-xs text-teal-100'
                      : 'rounded-full px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {overview.isLoading ? (
            <Skeleton className="mt-4 h-44" />
          ) : (
            <AreaChart daily={daily} metric={metric} height={200} className="mt-4" />
          )}
        </div>
      </GlassPanel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon
          const series = daily.map((d) =>
            c.key === 'sessions' ? Number(d.events || 0) : Number(d[c.key === 'events' ? 'events' : c.key] || 0),
          )
          // sessions don't have daily series — approximate with events sparkline tone only
          const sparkVals =
            c.key === 'sessions'
              ? daily.map((d) => Number(d.visitors || 0))
              : series
          const pct = trendPct(
            daily,
            c.key === 'sessions' ? 'visitors' : c.key === 'events' ? 'events' : c.key,
          )
          return (
            <GlassPanel key={c.key} className="relative overflow-hidden p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-zinc-500">{c.label}</p>
                  <p className="mt-1 font-heading text-3xl tabular-nums tracking-tight text-zinc-50">
                    {overview.isLoading ? '—' : c.value.toLocaleString('ru')}
                  </p>
                  <p className="mt-1 text-[11px]">
                    <TrendBadge pct={pct} />
                  </p>
                </div>
                <Icon size={16} className="text-zinc-600" aria-hidden />
              </div>
              <Sparkline
                values={sparkVals}
                stroke={c.stroke}
                fill={c.fill}
                className="mt-3 h-9 w-full"
                height={36}
              />
            </GlassPanel>
          )
        })}
      </div>

      {!overview.isLoading && !(data?.summary.events) ? (
        <GlassPanel className="p-10 text-center text-sm text-zinc-500">
          За выбранный период событий нет. Beacon на сайте пишет в{' '}
          <code className="text-zinc-400">/analytics/collect</code> — откройте публичные страницы или смените даты.
        </GlassPanel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassPanel className="p-5">
            <h2 className="font-heading text-base text-zinc-100">События</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Что фиксировал beacon за период</p>
            <div className="mt-4 space-y-3">
              {(data?.events ?? []).slice(0, 12).map((row) => (
                <BarRow
                  key={row.event_name}
                  label={row.event_name}
                  value={row.count}
                  max={maxEvent}
                  hint={`${row.visitors} чел.`}
                  tone="sky"
                />
              ))}
              {!data?.events?.length ? <p className="text-sm text-zinc-500">Нет данных</p> : null}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <h2 className="font-heading text-base text-zinc-100">Популярные страницы</h2>
            <p className="mt-0.5 text-xs text-zinc-500">По просмотрам</p>
            <div className="mt-4 space-y-3">
              {(data?.pages ?? []).slice(0, 12).map((row) => (
                <BarRow
                  key={row.path}
                  label={row.path || '/'}
                  value={row.views}
                  max={maxPage}
                  hint={`${row.visitors} чел.`}
                  tone="teal"
                />
              ))}
              {!data?.pages?.length ? <p className="text-sm text-zinc-500">Нет данных</p> : null}
            </div>
          </GlassPanel>

          {(data?.goals?.length ?? 0) > 0 ? (
            <GlassPanel className="p-5 lg:col-span-2">
              <h2 className="mb-3 font-heading text-base text-zinc-100">Цели</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data!.goals.map((g) => (
                  <div key={g.id} className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                    <p className="text-sm text-zinc-200">{g.name}</p>
                    <p className="mt-1 font-heading text-2xl tabular-nums">{g.conversions}</p>
                    <p className="text-xs text-zinc-500">конверсий · value {g.value}</p>
                  </div>
                ))}
              </div>
            </GlassPanel>
          ) : null}

          <GlassPanel className="overflow-x-auto p-5 lg:col-span-2">
            <h2 className="mb-3 font-heading text-base text-zinc-100">По дням</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="pb-2 text-left font-medium">Дата</th>
                  <th className="pb-2 text-right font-medium">События</th>
                  <th className="pb-2 text-right font-medium">Посетители</th>
                  <th className="pb-2 text-right font-medium">Просмотры</th>
                </tr>
              </thead>
              <tbody>
                {[...(daily)].reverse().map((row) => (
                  <tr key={row.date} className="border-t border-white/[0.06]">
                    <td className="py-2 tabular-nums text-zinc-300">{row.date}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-400">{row.events}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-400">{row.visitors}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-200">{row.page_views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassPanel>
        </div>
      )}
    </div>
  )
}
