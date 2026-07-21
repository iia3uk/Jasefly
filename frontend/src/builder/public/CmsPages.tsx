import type { ReactNode } from 'react'
import { useSite, usePage } from '@/hooks/useApi'
import { useAuth } from '@/context/AuthContext'
import { useSiteContext } from '@/context/SiteContext'
import { Container, RichText, Section, Skeleton, EmptyState } from '@/components/ui'
import { SeoHead } from '@/components/layout/SiteLayout'
import { LayoutRenderer } from '@/builder/render/LayoutRenderer'
import { initBuilderWidgets } from '@/builder/widgets'
import { parseLayout } from '@/builder/public/parseLayout'
import { mediaUrl } from '@/lib/api'
import type { PageLayout } from '@/types'

export { parseLayout }

initBuilderWidgets()

/** Заготовка каталога — не подменяет классическую страницу с реальными данными. */
export function isSeedLayout(layout: PageLayout | null | undefined): boolean {
  if (!layout?.elements?.length) return true
  if (layout.meta?.useOnSite === true) return false
  if (layout.meta?.seed === true) return true
  // Уже созданные пустышки без meta.seed (до фикса)
  const blob = JSON.stringify(layout)
  const markers = [
    'Оформите обложку раздела',
    'Карточки проектов — по /projects',
    'Добавьте заголовок и при необходимости виджеты',
    'Оформите раздел услуг в конструкторе',
    'Расскажите о себе, опыте и подходе',
    'Опишите, какие данные собирает сайт',
    'Такой страницы нет',
    'Добавьте виджеты профиля',
  ]
  return markers.some((m) => blob.includes(m))
}

/**
 * Если у CMS-страницы есть осознанный (не seed) layout — рендерим билдер,
 * иначе классический React-fallback с живыми данными.
 */
export function PreferCmsLayout({
  slug,
  fallback,
  seoPath,
}: {
  slug: string
  fallback: ReactNode
  seoPath?: string
}) {
  const { data: page, isLoading } = usePage(slug)
  if (isLoading) {
    return (
      <Container>
        <Skeleton className="my-16 h-72" />
      </Container>
    )
  }
  const layout = parseLayout(page)
  if (layout?.elements?.length && !isSeedLayout(layout)) {
    return (
      <>
        <SeoHead
          title={page?.seo_title || page?.title}
          description={page?.seo_description}
          path={seoPath ?? `/${slug}`}
          image={mediaUrl(page?.og_image_id ?? page?.og_image ?? null)}
        />
        <LayoutRenderer layout={layout} />
      </>
    )
  }
  return <>{fallback}</>
}

/** Home: prefer builder home_page document, else null (caller falls back). */
export function BuilderHomePage() {
  const { data: site, isLoading } = useSite()
  if (isLoading) {
    return (
      <Container>
        <Skeleton className="mt-24 h-[60vh]" />
      </Container>
    )
  }
  const layout = parseLayout(site?.home_page ?? null)
  // Same rule as HomePage: any non-seed / useOnSite layout replaces classic.
  if (!layout?.elements?.length || isSeedLayout(layout)) return null
  const home = site?.home_page
  return (
    <>
      <SeoHead
        path="/"
        title={home?.seo_title || home?.title}
        description={home?.seo_description}
        image={mediaUrl(home?.og_image_id ?? home?.og_image ?? null)}
      />
      <LayoutRenderer layout={layout} />
    </>
  )
}

export function CmsPageBySlug({ slug }: { slug: string }) {
  const { data: page, isLoading } = usePage(slug)
  const { token } = useAuth()
  if (isLoading) {
    return (
      <Container>
        <Skeleton className="my-16 h-72" />
      </Container>
    )
  }
  if (!page) return <EmptyState>Страница недоступна.</EmptyState>

  const layout = parseLayout(page)
  const isDraftPreview = page.status === 'draft' || page.preview === true
  return (
    <>
      <SeoHead
        title={page.seo_title || page.title}
        description={page.seo_description}
        path={`/${page.slug}`}
        image={mediaUrl(page.og_image_id ?? page.og_image ?? null)}
      />
      {isDraftPreview && token ? (
        <div className="sticky top-[var(--admin-bar-h,0px)] z-40 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-center text-[12px] text-amber-100">
          Черновик · на сайте виден только вам (админ). Гости получают «недоступна», пока не нажмёте «Публ.»
        </div>
      ) : null}
      {layout?.elements?.length ? (
        <LayoutRenderer layout={layout} />
      ) : page.content ? (
        <Section className="pt-10 sm:pt-14">
          <Container className="max-w-3xl">
            <h1 className="font-heading text-[2.1rem] font-semibold tracking-[-0.04em] sm:text-4xl">{page.title}</h1>
            <div className="mt-8 prose"><RichText html={page.content} /></div>
          </Container>
        </Section>
      ) : (
        <EmptyState>Страница пуста.</EmptyState>
      )}
    </>
  )
}

export function DynamicCmsPage() {
  const slug = typeof window !== 'undefined'
    ? window.location.pathname.replace(/^\//, '').split('/')[0]
    : ''
  // Prefer react-router param via wrapper in AppRouter
  return <CmsPageBySlug slug={slug} />
}

/** Дефолт, пока шаблон lazy-loader ещё не создан / не пришёл с API. */
function DefaultLazyLoader() {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4 px-6 py-16 text-center" role="status">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-white/15"
        style={{ borderTopColor: 'var(--accent, #8eb6ff)' }}
        aria-hidden
      />
      <p className="font-heading text-sm font-medium tracking-wide text-zinc-100">Загрузка</p>
      <p className="text-xs text-zinc-500">Подождите немного…</p>
    </div>
  )
}

/**
 * Экран lazy-load для Suspense: layout из шаблона `lazy-loader` (билдер),
 * иначе встроенный индикатор.
 */
export function LazyLoaderFallback() {
  const { site } = useSiteContext()
  const layout = parseLayout(site?.lazy_loader_page ?? null)
  if (layout?.elements?.length) {
    return (
      <div className="min-h-[40vh] w-full" data-lazy-loader="cms">
        <LayoutRenderer layout={layout} />
      </div>
    )
  }
  return <DefaultLazyLoader />
}
