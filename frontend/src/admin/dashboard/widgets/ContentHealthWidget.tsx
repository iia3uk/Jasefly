import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { usePluginEnabled, usePluginsHydrated } from '@/hooks/useApi'
import { Skeleton } from '@/components/ui'
import { t } from '@/admin/i18n'
import { fetchContentHealth, type HealthKind } from '@/admin/lib/contentHealth'
import { WidgetChrome } from './shared'

const HEALTH_COUNT_LABEL: Record<HealthKind, string> = {
  cover: t.contentHealthCover,
  seo: t.contentHealthSeo,
  slug: t.contentHealthSlug,
  summary: t.contentHealthSummary,
  draft: 'Черновики',
  scheduled: 'По расписанию',
  alt: 'Без alt',
}

export function ContentHealthWidget() {
  const pluginsReady = usePluginsHydrated()
  const projectsOn = usePluginEnabled('projects')
  const blogOn = usePluginEnabled('blog')
  const health = useQuery({
    queryKey: ['content-health'],
    queryFn: fetchContentHealth,
    enabled: pluginsReady,
  })

  return (
    <WidgetChrome
      title={t.contentHealth}
      hint={t.contentHealthHint}
      icon={AlertTriangle}
      accent="amber"
    >
      {health.isLoading ? (
        <Skeleton className="h-28" />
      ) : health.data && health.data.issues.length === 0 ? (
        <p className="text-sm text-emerald-300/90">{t.contentHealthOk}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-white/10 px-2 py-1 text-zinc-300">
              {health.data?.pageGaps ?? 0} страниц
            </span>
            <span className="rounded border border-white/10 px-2 py-1 text-zinc-300">
              {health.data?.mediaAltGaps ?? 0} без alt
            </span>
            {projectsOn ? (
              <span className="rounded border border-white/10 px-2 py-1 text-zinc-300">
                {health.data?.projectGaps ?? 0} {t.contentHealthProjects}
              </span>
            ) : null}
            {blogOn ? (
              <span className="rounded border border-white/10 px-2 py-1 text-zinc-300">
                {health.data?.blogGaps ?? 0} {t.contentHealthPosts}
              </span>
            ) : null}
            {(['seo', 'draft', 'scheduled', 'alt', 'cover', 'slug', 'summary'] as const).map((kind) => (
              <span key={kind} className="rounded border border-white/10 px-2 py-1 text-zinc-500">
                {HEALTH_COUNT_LABEL[kind]}: {health.data?.counts[kind] ?? 0}
              </span>
            ))}
          </div>
          <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto admin-quiet-scroll">
            {(health.data?.issues ?? []).slice(0, 10).map((issue) => (
              <li key={`${issue.resource}-${issue.id}-${issue.kind}`}>
                <Link
                  to={issue.href}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/[0.04]"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-zinc-200">{issue.title}</span>
                    <span className="text-zinc-500"> · {issue.label}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-zinc-600">{t.contentHealthOpen}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetChrome>
  )
}
