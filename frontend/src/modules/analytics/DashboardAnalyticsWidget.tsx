import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Eye, MousePointerClick, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { GlassPanel, Skeleton } from '@/components/ui'
import { usePluginEnabled } from '@/hooks/useApi'
import { adminUrl } from '@/admin/adminBasePath'
import { AreaChart, Sparkline, trendPct, type DailyPoint } from './AnalyticsCharts'

type Overview = {
  summary: {
    events: number
    visitors: number
    sessions: number
    page_views: number
  }
  daily: DailyPoint[]
  pages: Array<{ path: string; views: number; visitors: number }>
}

const unpack = <T,>(v: { data?: T } | T): T =>
  (v && typeof v === 'object' && 'data' in v ? (v as { data: T }).data : v as T)

function isoDate(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

export function DashboardAnalyticsWidget() {
  const on = usePluginEnabled('analytics')
  const from = isoDate(-13)
  const to = isoDate()

  const q = useQuery({
    queryKey: ['analytics', 'dashboard-widget', from, to],
    enabled: on,
    staleTime: 60_000,
    queryFn: async () =>
      unpack<Overview>(await api.get(`/admin/analytics/overview?from=${from}&to=${to}`)),
  })

  if (!on) return null

  const daily = Array.isArray(q.data?.daily) ? q.data.daily : []
  const summary = q.data && typeof q.data === 'object' && !Array.isArray(q.data) ? q.data.summary : undefined
  const views = summary?.page_views ?? 0
  const visitors = summary?.visitors ?? 0
  const sessions = summary?.sessions ?? 0
  const viewsTrend = trendPct(daily, 'page_views')
  const top = (q.data?.pages ?? []).slice(0, 3)
  const maxTop = Math.max(1, ...top.map((p) => p.views))

  return (
    <GlassPanel className="relative h-full overflow-hidden p-0">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 55% 90% at 0% 0%, rgb(45 212 191 / 0.12), transparent 55%), radial-gradient(ellipse 40% 70% at 100% 100%, rgb(56 189 248 / 0.07), transparent 50%)',
        }}
        aria-hidden
      />
      <div className="relative grid gap-0 lg:grid-cols-[1.35fr_1fr]">
        <div className="border-b border-white/[0.06] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-teal-300/75">Аналитика · 14 дней</p>
              <h2 className="mt-1 font-heading text-lg text-zinc-100">Пульс сайта</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Без хранения IP ·{' '}
                {viewsTrend == null
                  ? 'мало данных для тренда'
                  : viewsTrend === 0
                    ? 'стабильно к 1-й пол. периода'
                    : viewsTrend > 0
                      ? `просмотры +${viewsTrend}% к 1-й пол. периода`
                      : `просмотры ${viewsTrend}% к 1-й пол. периода`}
              </p>
            </div>
            <Link
              to={adminUrl('/analytics')}
              className="inline-flex items-center gap-1 rounded-full border border-teal-400/25 bg-teal-500/10 px-3 py-1 text-xs text-teal-100 transition hover:border-teal-300/40 hover:bg-teal-500/15"
            >
              Открыть
              <ArrowUpRight size={12} aria-hidden />
            </Link>
          </div>

          {q.isLoading ? (
            <Skeleton className="mt-5 h-36" />
          ) : (
            <AreaChart daily={daily} metric="page_views" height={140} className="mt-4" />
          )}
        </div>

        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Просмотры', value: views, icon: Eye, stroke: 'rgb(45 212 191)', fill: 'rgb(45 212 191 / 0.2)', series: daily.map((d) => d.page_views) },
              { label: 'Люди', value: visitors, icon: Users, stroke: 'rgb(251 191 36)', fill: 'rgb(251 191 36 / 0.18)', series: daily.map((d) => d.visitors) },
              {
                label: 'Сессии',
                value: sessions,
                icon: MousePointerClick,
                stroke: 'rgb(56 189 248)',
                fill: 'rgb(56 189 248 / 0.16)',
                series: daily.map((d) => d.events),
              },
            ].map((m) => {
              const Icon = m.icon
              return (
                <div key={m.label} className="rounded-xl border border-white/[0.06] bg-black/25 px-2.5 py-2.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[10px] text-zinc-500">{m.label}</p>
                    <Icon size={11} className="text-zinc-600" aria-hidden />
                  </div>
                  {q.isLoading ? (
                    <Skeleton className="mt-1 h-6 w-10" />
                  ) : (
                    <p className="mt-0.5 font-heading text-xl tabular-nums text-zinc-50">
                      {m.value.toLocaleString('ru')}
                    </p>
                  )}
                  <Sparkline
                    values={m.series}
                    stroke={m.stroke}
                    fill={m.fill}
                    height={22}
                    className="mt-1.5 h-[22px] w-full"
                  />
                </div>
              )
            })}
          </div>

          <div className="min-h-0 flex-1">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-600">Топ страниц</p>
            {q.isLoading ? (
              <Skeleton className="h-20" />
            ) : top.length ? (
              <ul className="space-y-2.5">
                {top.map((p) => {
                  const pct = Math.round((p.views / maxTop) * 100)
                  return (
                    <li key={p.path}>
                      <div className="mb-0.5 flex justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-mono text-zinc-300">{p.path || '/'}</span>
                        <span className="shrink-0 tabular-nums text-zinc-500">{p.views}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-white/[0.04]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-teal-300/80 to-emerald-400/40"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">Пока нет просмотров за период</p>
            )}
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}
