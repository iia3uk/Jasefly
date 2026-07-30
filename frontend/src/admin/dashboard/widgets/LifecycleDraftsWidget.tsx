import { Link } from 'react-router-dom'
import { Activity, FileText, FolderKanban, LayoutTemplate, Trash2 } from 'lucide-react'
import { useDashboard, usePluginEnabled } from '@/hooks/useApi'
import { GlassPanel, Skeleton } from '@/components/ui'
import { t } from '@/admin/i18n'
import { PROJECT_STATUS_LABELS, projectStatusTone } from '@/modules/projects/projectStatus'
import { adminUrl } from '@/admin/adminBasePath'

export function LifecycleDraftsWidget() {
  const { data, isLoading } = useDashboard()
  const projectsOn = usePluginEnabled('projects')
  const blogOn = usePluginEnabled('blog')
  const lifecycleTotal = Object.values(data?.project_lifecycle ?? {}).reduce((a, b) => a + b, 0)

  return (
    <div className="grid h-full gap-4 lg:grid-cols-2">
      {projectsOn ? (
        <GlassPanel className="p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-lg">{t.projectLifecycle}</h2>
            <Link to={adminUrl('/projects')} className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
              {t.projects}
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {isLoading ? (
              <Skeleton className="h-32" />
            ) : (
              Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => {
                const n = data?.project_lifecycle?.[key] ?? 0
                const pct = lifecycleTotal ? Math.round((n / lifecycleTotal) * 100) : 0
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className={`w-24 shrink-0 rounded border px-2 py-0.5 text-center text-[11px] ${projectStatusTone(key)}`}>
                      {label}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-white/25" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right text-sm tabular-nums text-zinc-400">{n}</span>
                  </div>
                )
              })
            )}
          </div>
        </GlassPanel>
      ) : null}

      <GlassPanel className="p-5">
        <h2 className="font-heading text-lg">{t.drafts}</h2>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            ...(projectsOn
              ? [{ label: t.projects, value: data?.drafts?.projects, href: adminUrl('/projects'), icon: FolderKanban }]
              : []),
            ...(blogOn
              ? [{ label: t.posts, value: data?.drafts?.posts, href: adminUrl('/blog'), icon: FileText }]
              : []),
            { label: t.pagesLabel, value: data?.drafts?.pages, href: adminUrl('/pages'), icon: LayoutTemplate },
          ].map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.href} to={item.href} className="rounded-lg p-3 transition hover:bg-white/[0.04]">
                <Icon size={14} className="mb-2 text-zinc-600" />
                <p className="text-xs text-zinc-500">{item.label}</p>
                <p className="font-heading text-2xl tabular-nums">{item.value ?? 0}</p>
              </Link>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-4">
          <Link
            to={adminUrl('/trash')}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04]"
          >
            <Trash2 size={14} />
            {t.trash}: {data?.trash_total ?? 0}
          </Link>
          <Link
            to={adminUrl('/activity')}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04]"
          >
            <Activity size={14} />
            {t.activityLog}
          </Link>
        </div>
      </GlassPanel>
    </div>
  )
}
