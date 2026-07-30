import { Link } from 'react-router-dom'
import { useDashboard, usePluginEnabled } from '@/hooks/useApi'
import { GlassPanel } from '@/components/ui'
import { t } from '@/admin/i18n'
import { adminUrl } from '@/admin/adminBasePath'

const PUBLISH_LABELS: Record<string, string> = {
  published: 'Опубликовано',
  draft: 'Черновики',
  archived: 'Архив',
}

function StatusBars({
  title,
  href,
  data,
}: {
  title: string
  href: string
  data?: Record<string, number>
}) {
  const total = Object.values(data ?? {}).reduce((a, b) => a + b, 0) || 1
  return (
    <GlassPanel className="h-full p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg">{title}</h2>
        <Link to={href} className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
          Открыть
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {(['published', 'draft', 'archived'] as const).map((key) => {
          const n = data?.[key] ?? 0
          const pct = Math.round((n / total) * 100)
          return (
            <div key={key}>
              <div className="mb-1 flex justify-between text-xs text-zinc-400">
                <span>{PUBLISH_LABELS[key]}</span>
                <span className="tabular-nums">{n}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full transition-all ${
                    key === 'published' ? 'bg-emerald-400/70' : key === 'draft' ? 'bg-amber-400/60' : 'bg-zinc-500/60'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </GlassPanel>
  )
}

export function PublishStatusWidget() {
  const { data } = useDashboard()
  const projectsOn = usePluginEnabled('projects')
  const blogOn = usePluginEnabled('blog')

  return (
    <div className="grid h-full gap-4 lg:grid-cols-3">
      {projectsOn ? (
        <StatusBars title={t.publishProjects} href={adminUrl('/projects')} data={data?.publish?.projects} />
      ) : null}
      {blogOn ? (
        <StatusBars title={t.publishPosts} href={adminUrl('/blog')} data={data?.publish?.posts} />
      ) : null}
      <StatusBars title={t.publishPages} href={adminUrl('/pages')} data={data?.publish?.pages} />
    </div>
  )
}
