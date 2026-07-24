import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, BriefcaseBusiness, Bot, FileText, FolderKanban, GraduationCap, Image, LayoutTemplate,
  Mail, MessageSquare, Package, Trash2, Users, Wrench, type LucideIcon,
} from 'lucide-react'
import { endpoints } from '@/lib/api'
import { useDashboard } from '@/hooks/useApi'
import { GlassPanel, Skeleton } from '@/components/ui'
import { t, dashboardCounts } from '@/admin/i18n'
import { PROJECT_STATUS_LABELS, projectStatusTone } from '@/modules/projects/projectStatus'
import { fetchContentHealth, type HealthKind } from '@/admin/lib/contentHealth'
import { adminUrl } from '@/admin/adminBasePath'
import { isPluginEnabled } from '@/core/moduleRegistry'

const COUNT_META: Record<string, { href: string; icon: LucideIcon }> = {
  projects: { href: adminUrl('/projects'), icon: FolderKanban },
  blog_posts: { href: adminUrl('/blog'), icon: FileText },
  contact_messages: { href: adminUrl('/messages'), icon: Mail },
  media: { href: adminUrl('/media'), icon: Image },
  services: { href: adminUrl('/services'), icon: Wrench },
  testimonials: { href: adminUrl('/testimonials'), icon: MessageSquare },
  pages: { href: adminUrl('/pages'), icon: LayoutTemplate },
  users: { href: adminUrl('/users'), icon: Users },
  experience: { href: adminUrl('/experience'), icon: BriefcaseBusiness },
  education: { href: adminUrl('/education'), icon: GraduationCap },
  skills: { href: adminUrl('/skills'), icon: Activity },
  products: { href: adminUrl('/products'), icon: Package },
}

const COUNT_ORDER = [
  'projects', 'blog_posts', 'pages', 'media',
  'contact_messages', 'products', 'services', 'testimonials',
  'users', 'experience', 'education', 'skills',
] as const

const PUBLISH_LABELS: Record<string, string> = {
  published: 'Опубликовано',
  draft: 'Черновики',
  archived: 'Архив',
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
  force_delete: 'Удаление навсегда',
  restore: 'Восстановление',
  publish: 'Публикация',
  login: 'Вход',
  logout: 'Выход',
  settings_change: 'Настройки',
  password_change: 'Пароль',
  empty_trash: 'Очистка корзины',
  webhook: 'Webhook',
  mcp_changelog: 'Changelog',
}

function formatWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
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
    <GlassPanel className="p-5">
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
                <span>{n}</span>
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

const HEALTH_COUNT_LABEL: Record<HealthKind, string> = {
  cover: t.contentHealthCover,
  seo: t.contentHealthSeo,
  slug: t.contentHealthSlug,
  summary: t.contentHealthSummary,
  draft: 'Черновики',
  scheduled: 'По расписанию',
  alt: 'Без alt',
}

export function DashboardPage() {
  const { data, isLoading } = useDashboard()
  const lifecycleTotal = Object.values(data?.project_lifecycle ?? {}).reduce((a, b) => a + b, 0)
  const health = useQuery({ queryKey: ['content-health'], queryFn: fetchContentHealth })
  const mcpActivity = useQuery({
    queryKey: ['activity', 'mcp', 'dashboard'],
    queryFn: () => endpoints.activity({ source: 'mcp', limit: 8 }),
  })

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl">{t.dashboard}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t.dashboardHint}</p>
        </div>
        {(data?.unread_messages ?? 0) > 0 && (
          <Link
            to={adminUrl('/messages')} className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-100"
          >
            {t.unreadMessages}: {data?.unread_messages}
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <GlassPanel className="p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-heading text-lg">{t.contentHealth}</h2>
              <p className="mt-1 text-xs text-zinc-500">{t.contentHealthHint}</p>
            </div>
            <AlertTriangle size={16} className="shrink-0 text-amber-400/70" aria-hidden />
          </div>
          {health.isLoading ? (
            <Skeleton className="mt-4 h-28" />
          ) : health.data && health.data.issues.length === 0 ? (
            <p className="mt-4 text-sm text-emerald-300/90">{t.contentHealthOk}</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded border border-white/10 px-2 py-1 text-zinc-300">
                  {health.data?.pageGaps ?? 0} страниц
                </span>
                <span className="rounded border border-white/10 px-2 py-1 text-zinc-300">
                  {health.data?.mediaAltGaps ?? 0} без alt
                </span>
                {isPluginEnabled('projects') ? (
                  <span className="rounded border border-white/10 px-2 py-1 text-zinc-300">
                    {health.data?.projectGaps ?? 0} {t.contentHealthProjects}
                  </span>
                ) : null}
                {isPluginEnabled('blog') ? (
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
              <ul className="mt-4 max-h-48 space-y-1.5 overflow-y-auto admin-quiet-scroll">
                {(health.data?.issues ?? []).slice(0, 12).map((issue) => (
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
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-heading text-lg">{t.mcpStrip}</h2>
              <p className="mt-1 text-xs text-zinc-500">{t.mcpStripHint}</p>
            </div>
            <Bot size={16} className="shrink-0 text-cyan-300/80" aria-hidden />
          </div>
          <div className="mt-4 space-y-2">
            {mcpActivity.isLoading ? (
              <Skeleton className="h-28" />
            ) : mcpActivity.data?.length ? (
              mcpActivity.data.map((row) => (
                <div key={String(row.id)} className="rounded-lg border border-white/5 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm">
                      <span className="mr-2 rounded border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                        MCP
                      </span>
                      <span className="text-zinc-300">{ACTION_LABELS[String(row.action)] ?? String(row.action)}</span>
                      {row.entity_type ? <span className="text-zinc-500"> · {String(row.entity_type)}</span> : null}
                      {row.entity_label ? <span className="text-zinc-400"> — {String(row.entity_label)}</span> : null}
                    </p>
                    <span className="shrink-0 text-[11px] text-zinc-600">{formatWhen(String(row.created_at ?? ''))}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-500">{t.mcpStripEmpty}</p>
            )}
          </div>
          <Link
            to={adminUrl('/activity?source=mcp')} className="mt-4 inline-flex text-xs text-cyan-200/90 underline-offset-2 hover:underline"
          >
            {t.mcpStripAll}
          </Link>
        </GlassPanel>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ...(isPluginEnabled('projects')
            ? [{ label: t.weekProjects, value: data?.recent?.projects_7d, href: adminUrl('/projects') }]
            : []),
          { label: t.weekPosts, value: data?.recent?.posts_7d, href: adminUrl('/blog') },
          { label: t.weekMedia, value: data?.recent?.media_7d, href: adminUrl('/media') },
          { label: t.weekMessages, value: data?.recent?.messages_7d, href: adminUrl('/messages') },
        ].map((item) => (
          <Link key={item.label} to={item.href} className="block transition hover:opacity-90">
            <GlassPanel className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-xs text-zinc-500">{item.label}</span>
              {isLoading ? <Skeleton className="h-6 w-8" /> : (
                <span className="font-heading text-xl">{item.value ?? 0}</span>
              )}
            </GlassPanel>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)
          : COUNT_ORDER.filter((name) => {
              if (name === 'projects' || name === 'services' || name === 'testimonials' || name === 'experience' || name === 'education' || name === 'skills') {
                return isPluginEnabled('portfolio') || isPluginEnabled('projects')
              }
              if (name === 'products') return isPluginEnabled('products')
              if (name === 'blog_posts') return isPluginEnabled('blog')
              return true
            }).map((name) => {
              const count = data?.counts?.[name] ?? 0
              // Hide empty optional plugins that are zero and unused — still show products if module exists (always 0 ok)
              const meta = COUNT_META[name]
              const Icon = meta?.icon ?? FileText
              const label = dashboardCounts[name] ?? name.replace(/_/g, ' ')
              const href = meta?.href
              const unread = name === 'contact_messages' ? (data?.unread_messages ?? 0) : 0
              const body = (
                <GlassPanel className="relative p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-zinc-500">{label}</p>
                    <Icon size={16} className="shrink-0 text-zinc-600" aria-hidden />
                  </div>
                  <p className="mt-2 font-heading text-3xl">{count}</p>
                  {unread > 0 && (
                    <p className="mt-1 text-xs text-amber-300/90">{t.unreadShort}: {unread}</p>
                  )}
                </GlassPanel>
              )
              return href ? (
                <Link key={name} to={href} className="block transition hover:opacity-90">{body}</Link>
              ) : (
                <div key={name}>{body}</div>
              )
            })}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {isPluginEnabled('projects') ? (
          <StatusBars title={t.publishProjects} href={adminUrl('/projects')} data={data?.publish?.projects} />
        ) : null}
        <StatusBars title={t.publishPosts} href={adminUrl('/blog')} data={data?.publish?.posts} />
        <StatusBars title={t.publishPages} href={adminUrl('/pages')} data={data?.publish?.pages} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {isPluginEnabled('projects') ? (
          <GlassPanel className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg">{t.projectLifecycle}</h2>
              <Link to={adminUrl('/projects')} className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
                {t.projects}
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {isLoading ? <Skeleton className="h-32" /> : (
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
              ...(isPluginEnabled('projects')
                ? [{ label: t.projects, value: data?.drafts?.projects, href: adminUrl('/projects'), icon: FolderKanban }]
                : []),
              { label: t.posts, value: data?.drafts?.posts, href: adminUrl('/blog'), icon: FileText },
              { label: t.pagesLabel, value: data?.drafts?.pages, href: adminUrl('/pages'), icon: LayoutTemplate },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Link key={item.href} to={item.href} className="rounded-lg p-3 transition hover:bg-white/[0.04]">
                  <Icon size={14} className="mb-2 text-zinc-600" />
                  <p className="text-xs text-zinc-500">{item.label}</p>
                  <p className="font-heading text-2xl">{item.value ?? 0}</p>
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

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-xl">{t.recentMessages}</h2>
            <Link to={adminUrl('/messages')} className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
              {t.allMessages}
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {isLoading ? <Skeleton className="h-40" /> : (data?.messages?.length ? data.messages.map((x) => {
              const unread = Number(x.is_read ?? 0) === 0
              return (
                <Link key={String(x.id)} to={adminUrl('/messages')} className="block">
                  <GlassPanel className={`p-4 transition hover:bg-white/[0.03] ${unread ? 'border-amber-400/20' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <b className="truncate">{x.name}</b>
                      {unread && <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-300">{t.unreadShort}</span>}
                    </div>
                    <p className="truncate text-sm text-zinc-500">{x.subject || x.message}</p>
                    <p className="mt-1 text-[11px] text-zinc-600">{formatWhen(x.created_at)}</p>
                  </GlassPanel>
                </Link>
              )
            }) : (
              <GlassPanel className="p-8 text-center text-sm text-zinc-500">{t.noMessages}</GlassPanel>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-xl">{t.recentActivity}</h2>
            <Link to={adminUrl('/activity')} className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
              {t.activityLog}
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {isLoading ? <Skeleton className="h-40" /> : (data?.activity?.length ? data.activity.map((row) => (
              <GlassPanel key={String(row.id)} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">
                    <span className="text-zinc-300">{ACTION_LABELS[String(row.action)] ?? String(row.action)}</span>
                    {row.entity_type ? (
                      <span className="text-zinc-500"> · {String(row.entity_type)}</span>
                    ) : null}
                    {row.entity_label ? (
                      <span className="text-zinc-400"> — {String(row.entity_label)}</span>
                    ) : null}
                  </p>
                  <span className="shrink-0 text-[11px] text-zinc-600">{formatWhen(String(row.created_at ?? ''))}</span>
                </div>
                {row.user_name ? <p className="mt-0.5 text-xs text-zinc-600">{String(row.user_name)}</p> : null}
              </GlassPanel>
            )) : (
              <GlassPanel className="p-8 text-center text-sm text-zinc-500">{t.noActivity}</GlassPanel>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
