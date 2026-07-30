import { Link, useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { usePage } from '@/hooks/useApi'

const LABELS: Record<string, string> = {
  features: 'Возможности',
  workflow: 'Как это работает',
  modules: 'Модули',
  mcp: 'MCP и AI',
  'shared-hosting': 'Shared Hosting',
  docs: 'Документация',
  updates: 'Обновления',
  about: 'О проекте',
  contact: 'Контакты',
  privacy: 'Конфиденциальность',
  terms: 'Условия использования',
  blog: 'Блог',
  'api-docs': 'API',
}

/** Visual + JSON-LD breadcrumbs for inner pages (home skipped). */
export function SiteBreadcrumbs() {
  const { pathname } = useLocation()
  const path = pathname.replace(/\/+$/, '') || '/'
  const seg = path.replace(/^\//, '').split('/')[0] || ''
  const hidden =
    path === '/'
    || path.startsWith('/admin')
    || path.startsWith('/lab')
    || !seg
  const { data: page } = usePage(hidden ? '' : seg)
  if (hidden) return null

  const label = page?.title || LABELS[seg] || seg
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: label, item: `${origin}${path}` },
    ],
  }

  return (
    <>
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <nav aria-label="Хлебные крошки" data-translate-root className="border-b border-white/[0.04] bg-black/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 text-xs text-[var(--muted)] sm:px-6">
          <Link to="/" className="link-text hover:text-[var(--text)]">Главная</Link>
          <span aria-hidden>/</span>
          <span className="text-[var(--text)]" aria-current="page">{label}</span>
        </div>
      </nav>
    </>
  )
}
