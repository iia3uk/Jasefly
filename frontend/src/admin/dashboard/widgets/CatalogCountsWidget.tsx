import { Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  Activity, BriefcaseBusiness, FileText, FolderKanban, GraduationCap, Image, LayoutTemplate,
  Mail, MessageSquare, Package, Users, Wrench, type LucideIcon,
} from 'lucide-react'
import { useDashboard, usePluginEnabled } from '@/hooks/useApi'
import { GlassPanel, Skeleton } from '@/components/ui'
import { t, dashboardCounts } from '@/admin/i18n'
import { adminUrl } from '@/admin/adminBasePath'

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

export function CatalogCountsWidget() {
  const { data, isLoading } = useDashboard()
  const projectsOn = usePluginEnabled('projects')
  const blogOn = usePluginEnabled('blog')
  const portfolioOn = usePluginEnabled('portfolio')
  const productsOn = usePluginEnabled('products')

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {COUNT_ORDER.filter((name) => {
        if (name === 'projects' || name === 'services' || name === 'testimonials' || name === 'experience' || name === 'education' || name === 'skills') {
          return portfolioOn || projectsOn
        }
        if (name === 'products') return productsOn
        if (name === 'blog_posts') return blogOn
        return true
      }).map((name) => {
        const count = data?.counts?.[name] ?? 0
        const meta = COUNT_META[name]
        const Icon = meta?.icon ?? FileText
        const label = dashboardCounts[name] ?? name.replace(/_/g, ' ')
        const href = meta?.href
        const unread = name === 'contact_messages' ? (data?.unread_messages ?? 0) : 0
        const body = (
          <GlassPanel className={clsx('relative flex h-full min-h-[7.25rem] flex-col p-5', unread > 0 && 'border-amber-400/20')}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-zinc-500">{label}</p>
              <Icon size={16} className={clsx('shrink-0', unread > 0 ? 'text-amber-300/80' : 'text-zinc-600')} aria-hidden />
            </div>
            <p className="mt-2 font-heading text-3xl tracking-tight tabular-nums">{count}</p>
            {unread > 0 && (
              <p className="mt-auto pt-2 text-xs font-medium text-amber-300/90">{t.unreadShort}: {unread}</p>
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
  )
}
