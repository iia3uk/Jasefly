import { Link } from 'react-router-dom'
import { useDashboard, usePluginEnabled } from '@/hooks/useApi'
import { GlassPanel, Skeleton } from '@/components/ui'
import { t } from '@/admin/i18n'
import { adminUrl } from '@/admin/adminBasePath'

export function WeekStatsWidget() {
  const { data, isLoading } = useDashboard()
  const projectsOn = usePluginEnabled('projects')
  const blogOn = usePluginEnabled('blog')

  const items = [
    ...(projectsOn
      ? [{ label: t.weekProjects, value: data?.recent?.projects_7d, href: adminUrl('/projects') }]
      : []),
    ...(blogOn
      ? [{ label: t.weekPosts, value: data?.recent?.posts_7d, href: adminUrl('/blog') }]
      : []),
    { label: t.weekMedia, value: data?.recent?.media_7d, href: adminUrl('/media') },
    { label: t.weekMessages, value: data?.recent?.messages_7d, href: adminUrl('/messages') },
  ]

  return (
    <div className="grid h-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Link key={item.label} to={item.href} className="block transition hover:opacity-90">
          <GlassPanel className="flex h-full items-center justify-between gap-3 px-4 py-3">
            <span className="text-xs text-zinc-500">{item.label}</span>
            {isLoading ? (
              <Skeleton className="h-6 w-8" />
            ) : (
              <span className="font-heading text-xl tabular-nums">{item.value ?? 0}</span>
            )}
          </GlassPanel>
        </Link>
      ))}
    </div>
  )
}
