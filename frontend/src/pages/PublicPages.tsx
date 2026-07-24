import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import {
  Container,
  EmptyState,
  MediaImage,
  RichText,
  Section,
  SectionHeading,
  Skeleton,
  SurfacePanel,
} from '@/components/ui'
import { SeoHead } from '@/components/layout/SiteLayout'
import { sanitizeEmbed } from '@/shared/sanitize'
import {
  useBlog,
  useContactInfo,
  useEducation,
  useExperience,
  usePage,
  usePost,
  useProduct,
  useProfile,
  useProject,
  useProjects,
  useServices,
  useSite,
  useSkills,
  useStatistics,
  useTestimonials,
} from '@/hooks/useApi'
import { ProductEntityProvider } from '@/builder/context/ProductEntityContext'
import { parseLayout } from '@/builder/public/parseLayout'
import { isSeedLayout } from '@/builder/public/CmsPages'
import { ProductDetailFallback } from '@/modules/products'
import { ProjectCard, ProjectGrid } from '@/modules/projects/components/ProjectCard'
import type { HomepageSection } from '@/types'
import { SkillsBlock } from '@/shared/SkillsBlock'
import {
  BlogPostView,
  ExperienceItemView,
  HeroView,
  ProfileHeroView,
  ProjectDetailView,
  ServiceCardView,
  formatRange,
  profilePortrait,
} from '@/shared/views'
import { LayoutRenderer } from '@/builder/render/LayoutRenderer'
import { initBuilderWidgets } from '@/builder/widgets'
import { siteHasPlugin } from '@/core/pluginGates'
import type { PageLayout } from '@/types'

initBuilderWidgets()

const Reveal = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-10%' }}
    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
)

function sectionMap(sections: HomepageSection[] = []) {
  return Object.fromEntries(sections.map((s) => [s.section_key, s])) as Record<string, HomepageSection>
}

function StatsStrip({ items }: { items: Array<{ id?: string | number; value?: string | number | null; suffix?: string | null; label?: string | null }> }) {
  if (!items.length) return null
  return (
    <div className="grid grid-cols-2 gap-4 border-y border-white/[0.08] py-6 sm:gap-8 sm:py-10 lg:grid-cols-4">
      {items.map((stat) => (
        <div key={String(stat.id)} className="min-w-0">
          <p className="break-words font-heading text-2xl font-semibold tracking-[-0.04em] tabular-nums sm:text-3xl lg:text-4xl">
            {stat.value}{stat.suffix}
          </p>
          <p className="mt-2 text-xs text-[var(--muted)] sm:text-sm">{stat.label}</p>
        </div>
      ))}
    </div>
  )
}

function PageIntro({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string | null
  title: string
  subtitle?: string | null
}) {
  return (
    <div className="mb-8 max-w-3xl sm:mb-12">
      {eyebrow && <p className="text-sm font-medium tracking-[0.02em] text-[var(--accent)]">{eyebrow}</p>}
      <h1 className={`font-heading text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.05em] sm:text-5xl lg:text-6xl ${eyebrow ? 'mt-3' : ''}`}>
        {title}
      </h1>
      {subtitle && <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)] sm:mt-5 sm:text-lg sm:leading-8">{subtitle}</p>}
    </div>
  )
}

export function AboutPage() {
  const profile = useProfile()
  const xp = useExperience()
  const education = useEducation()
  const skills = useSkills()
  const stats = useStatistics()
  const p = profile.data

  return (
    <>
      <SeoHead title="Обо мне" path="/about" description={p?.short_bio} />

      {p ? <ProfileHeroView profile={p} /> : (
        <Section className="pt-10"><Container><Skeleton className="h-64" /></Container></Section>
      )}

      {!!stats.data?.length && (
        <Section className="!py-10 sm:!py-14">
          <Container>
            <StatsStrip items={stats.data} />
          </Container>
        </Section>
      )}

      {!!xp.data?.length && (
        <Section>
          <Container>
            <SectionHeading title="Опыт" subtitle="Где и чем занимался end-to-end." />
            <div className="mt-2">
              {xp.data.map((item) => (
                <Reveal key={String(item.id)}>
                  <ExperienceItemView item={item} />
                </Reveal>
              ))}
            </div>
          </Container>
        </Section>
      )}

      {!!skills.data?.length && (
        <Section>
          <Container>
            <SectionHeading title="Навыки" subtitle="Инструменты и направления, с которыми работаю постоянно." />
            <SkillsBlock categories={skills.data} size="sm" preset="tabs" />
          </Container>
        </Section>
      )}

      {!!education.data?.length && (
        <Section>
          <Container>
            <SectionHeading title="Образование и путь" />
            <div className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.08]">
              {education.data.map((item) => (
                <article key={String(item.id)} className="grid gap-3 py-8 md:grid-cols-[7.5rem_1fr] md:gap-10">
                  <p className="text-sm tabular-nums text-[var(--muted)]">
                    {formatRange(item.start_date, item.end_date)}
                  </p>
                  <div>
                    <h3 className="font-heading text-xl font-semibold">{item.degree}</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {item.institution}
                      {item.field_of_study ? ` · ${item.field_of_study}` : ''}
                    </p>
                    {item.description && (
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">{item.description}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </Container>
        </Section>
      )}
    </>
  )
}

export function HomePage() {
  const { data: site, isLoading } = useSite()
  const pluginsReady = Array.isArray(site?.enabled_plugins)
  const portfolioOn = siteHasPlugin(site?.enabled_plugins, 'portfolio')

  const homeLayout: PageLayout | null = site?.home_page?.layout
    ?? (typeof site?.home_page?.layout_json === 'string' && site.home_page.layout_json
      ? (() => { try { return JSON.parse(site.home_page!.layout_json!) as PageLayout } catch { return null } })()
      : null)

  // Saved builder home wins over classic template once layout is marked useOnSite / non-seed.
  const useBuilderHome =
    !!homeLayout?.elements?.length
    && !isSeedLayout(homeLayout)

  // Classic portfolio home only — builder layout must not spam /projects when Portfolio is off.
  const classicHome = pluginsReady && portfolioOn && !useBuilderHome

  const featured = useProjects(true, classicHome)
  const allProjects = useProjects(false, classicHome)
  const services = useServices()
  const testimonials = useTestimonials()
  const skills = useSkills()
  const experience = useExperience()
  const blog = useBlog()
  const stats = useStatistics()
  const profile = useProfile()

  const sections = sectionMap(site?.homepage_sections)
  const hero = site?.hero
  const projects = (featured.data?.length ? featured.data : allProjects.data)?.slice(0, 3)

  if (isLoading || !pluginsReady) {
    return (
      <Container>
        <Skeleton className="mt-24 h-[60vh]" />
      </Container>
    )
  }

  if (useBuilderHome) {
    return (
      <>
        <SeoHead path="/" />
        <LayoutRenderer layout={homeLayout!} />
      </>
    )
  }

  if (!portfolioOn) {
    return (
      <>
        <SeoHead path="/" />
        <Section className="pt-16">
          <Container>
            <EmptyState className="py-24 text-center">
              <p className="font-heading text-xl font-semibold">Контент портфолио скрыт</p>
              <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                Плагин Portfolio выключен. Включите его в админке или соберите главную в конструкторе.
              </p>
            </EmptyState>
          </Container>
        </Section>
      </>
    )
  }

  return (
    <>
      <SeoHead path="/" />
      <HeroView hero={hero || {}} />

      {sections.about_preview && (
        <Section>
          <Container>
            <Reveal>
              <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                {profilePortrait(profile.data) ? (
                  <MediaImage
                    media={profilePortrait(profile.data)}
                    alt={profile.data?.name ?? ''}
                    className="aspect-[4/5] w-full max-w-sm rounded-[calc(var(--radius)+4px)] object-cover lg:max-w-none"
                  />
                ) : null}
                <div>
                  <SectionHeading
                    title={sections.about_preview.title}
                    subtitle={sections.about_preview.subtitle || profile.data?.short_bio}
                    action={
                      sections.about_preview.cta_href ? (
                        <Link to={sections.about_preview.cta_href} className="link-text text-sm">
                          {sections.about_preview.cta_label}
                        </Link>
                      ) : null
                    }
                  />
                  {!!stats.data?.length && <StatsStrip items={stats.data} />}
                </div>
              </div>
            </Reveal>
          </Container>
        </Section>
      )}

      {sections.featured_projects && (
        <Section>
          <Container>
            <SectionHeading
              title={sections.featured_projects.title}
              subtitle={sections.featured_projects.subtitle}
              action={
                sections.featured_projects.cta_href ? (
                  <Link to={sections.featured_projects.cta_href} className="link-text text-sm">
                    {sections.featured_projects.cta_label}
                  </Link>
                ) : null
              }
            />
            <div className="grid gap-x-6 gap-y-10 sm:gap-x-8 sm:gap-y-12 md:grid-cols-2">
              {projects?.map((p) => <Reveal key={String(p.id)}><ProjectCard project={p} /></Reveal>)}
            </div>
          </Container>
        </Section>
      )}

      {sections.skills && (
        <Section>
          <Container>
            <SectionHeading title={sections.skills.title} subtitle={sections.skills.subtitle} />
            <SkillsBlock categories={skills.data} size="sm" preset="tabs" />
          </Container>
        </Section>
      )}

      {sections.experience && (
        <Section>
          <Container>
            <SectionHeading title={sections.experience.title} subtitle={sections.experience.subtitle} />
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.08]">
              {experience.data?.map((item) => (
                <article key={String(item.id)} className="grid gap-3 py-8 sm:grid-cols-[7.5rem_1fr] sm:gap-8">
                  <p className="text-sm tabular-nums text-[var(--muted)]">
                    {item.start_date?.slice(0, 4)} — {item.is_current ? 'н.в.' : item.end_date?.slice(0, 4)}
                  </p>
                  <div className="min-w-0">
                    <h3 className="font-heading text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{item.role}</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">{item.company}{item.location ? ` · ${item.location}` : ''}</p>
                    <div className="mt-3"><RichText html={item.description} /></div>
                  </div>
                </article>
              ))}
            </div>
          </Container>
        </Section>
      )}

      {sections.services && (
        <Section>
          <Container>
            <SectionHeading
              title={sections.services.title}
              subtitle={sections.services.subtitle}
              action={
                sections.services.cta_href ? (
                  <Link to={sections.services.cta_href} className="link-text text-sm">
                    {sections.services.cta_label}
                  </Link>
                ) : null
              }
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.data?.map((service, i) => (
                <SurfacePanel key={String(service.id)} className="p-5 sm:p-7">
                  <span className="font-heading text-[0.65rem] tracking-[0.18em] text-[var(--muted)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 font-heading text-xl font-semibold tracking-[-0.03em]">{service.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                    {service.short_description || service.description?.replace(/<[^>]+>/g, '')}
                  </p>
                </SurfacePanel>
              ))}
            </div>
          </Container>
        </Section>
      )}

      {sections.testimonials && !!testimonials.data?.length && (
        <Section>
          <Container>
            <SectionHeading title={sections.testimonials.title} subtitle={sections.testimonials.subtitle} />
            <div className="grid gap-4 md:grid-cols-2">
              {testimonials.data.map((item) => (
                <SurfacePanel key={String(item.id)} className="p-6 sm:p-8">
                  <p className="text-base leading-8 text-[var(--text)] sm:text-lg">“{item.content}”</p>
                  <p className="mt-6 text-sm text-[var(--muted)]">
                    {item.author_name}
                    {(item.author_role || item.author_company) &&
                      ` — ${[item.author_role, item.author_company].filter(Boolean).join(', ')}`}
                  </p>
                </SurfacePanel>
              ))}
            </div>
          </Container>
        </Section>
      )}

      {sections.blog_preview && (
        <Section>
          <Container>
            <SectionHeading
              title={sections.blog_preview.title}
              subtitle={sections.blog_preview.subtitle}
              action={
                sections.blog_preview.cta_href ? (
                  <Link to={sections.blog_preview.cta_href} className="link-text text-sm">
                    {sections.blog_preview.cta_label}
                  </Link>
                ) : null
              }
            />
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.08]">
              {blog.data?.slice(0, 3).map((post) => (
                <Link key={String(post.id)} to={`/blog/${post.slug}`} className="link-row group block py-7 sm:py-8">
                  <h3 className="font-heading text-xl font-semibold tracking-[-0.03em] transition group-hover:text-[var(--accent)] sm:text-2xl">
                    {post.title}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted)] sm:mt-3">{post.excerpt}</p>
                  <span className="mt-3 inline-block text-sm font-medium text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-4 transition group-hover:decoration-[var(--accent)]">
                    Читать
                  </span>
                </Link>
              ))}
            </div>
          </Container>
        </Section>
      )}

      {sections.contact_cta && (
        <Section>
          <Container>
            <SurfacePanel className="px-5 py-10 sm:px-10 sm:py-12 lg:px-12">
              <h2 className="max-w-2xl font-heading text-[1.75rem] font-semibold tracking-[-0.04em] sm:text-3xl lg:text-4xl">
                {sections.contact_cta.title}
              </h2>
              <p className="mt-4 max-w-xl text-[var(--muted)]">{sections.contact_cta.subtitle}</p>
              {sections.contact_cta.cta_href && (
                <Link to={sections.contact_cta.cta_href} className="button mt-8 w-full sm:w-auto">
                  {sections.contact_cta.cta_label}
                </Link>
              )}
            </SurfacePanel>
          </Container>
        </Section>
      )}
    </>
  )
}

export function ProjectsPage() {
  const { data, isLoading } = useProjects()
  return (
    <Section className="pt-10 sm:pt-14">
      <Container>
        <SeoHead title="Проекты" path="/projects" />
        <PageIntro title="Проекты" subtitle="Игры, автоматизация, веб и инструменты — то, что довёл до рабочего результата." />
        {isLoading ? <Skeleton className="h-80" /> : data ? <ProjectGrid projects={data} /> : null}
      </Container>
    </Section>
  )
}

export function ProjectDetailPage() {
  const { slug = '' } = useParams()
  const { data: project, isLoading } = useProject(slug)

  if (isLoading) return <Container><Skeleton className="my-16 h-72 sm:my-24 sm:h-96" /></Container>
  if (!project) return <EmptyState>Проект недоступен.</EmptyState>

  return (
    <>
      <SeoHead title={project.title} description={project.short_description} path={`/projects/${project.slug}`} />
      <ProjectDetailView project={project} />
    </>
  )
}

export function ProductDetailPage() {
  const { slug = '' } = useParams()
  const { data: product, isLoading } = useProduct(slug)
  const { data: storeConfig } = useQuery({
    queryKey: ['products-config'],
    queryFn: async () => {
      const res = await api.get<{ data: { page_slug?: string; storefront_template?: string } }>('/products/config')
      return (res as { data?: { page_slug?: string; storefront_template?: string } })?.data ?? null
    },
  })
  const pageSlug = storeConfig?.page_slug || 'product-detail'
  const { data: templatePage } = usePage(pageSlug)
  const { data: fallbackPage } = usePage(pageSlug === 'product-detail' ? '' : 'product-detail')

  if (isLoading) {
    return (
      <Container>
        <Skeleton className="my-16 h-72 sm:my-24 sm:h-96" />
      </Container>
    )
  }
  if (!product) return <EmptyState>Товар недоступен.</EmptyState>

  const layout = parseLayout(templatePage ?? null) ?? parseLayout(fallbackPage ?? null)

  return (
    <>
      <SeoHead
        title={product.title}
        description={product.short_description || undefined}
        path={`/products/${product.slug}`}
      />
      {layout?.elements?.length ? (
        <ProductEntityProvider product={product}>
          <LayoutRenderer layout={layout} />
        </ProductEntityProvider>
      ) : (
        <Section className="pt-10 sm:pt-14">
          <Container>
            <ProductDetailFallback product={product} />
          </Container>
        </Section>
      )}
    </>
  )
}

export function ServicesPage() {
  const { data } = useServices()
  return (
    <Section className="pt-10 sm:pt-14">
      <Container>
        <SeoHead title="Услуги" path="/services" />
        <PageIntro title="Услуги" subtitle="Форматы работы: игры, веб, промышленная автоматизация, боты и UI." />
        <div className="grid gap-4 sm:grid-cols-2">
          {data?.map((service, i) => (
            <ServiceCardView key={String(service.id)} service={service} index={i} />
          ))}
        </div>
      </Container>
    </Section>
  )
}

export function BlogPage() {
  const { data } = useBlog()
  return (
    <Section className="pt-10 sm:pt-14">
      <Container>
        <SeoHead title="Блог" path="/blog" />
        <PageIntro title="Заметки" subtitle="О процессе, AI и игровых системах." />
        <div className="divide-y divide-white/[0.06] border-t border-white/[0.08]">
          {data?.map((post) => (
            <Link key={String(post.id)} to={`/blog/${post.slug}`} className="link-row group block py-7 sm:py-8">
              <h2 className="font-heading text-xl font-semibold tracking-[-0.03em] transition group-hover:text-[var(--accent)] sm:text-2xl">{post.title}</h2>
              <p className="mt-2 text-[var(--muted)]">{post.excerpt}</p>
              <p className="mt-3 text-sm text-[var(--muted)]">
                {post.reading_time ? `${post.reading_time} мин` : null}
                {post.published_at ? ` · ${new Date(post.published_at).toLocaleDateString('ru-RU')}` : null}
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-4 transition group-hover:decoration-[var(--accent)]">
                Читать
              </span>
            </Link>
          ))}
        </div>
      </Container>
    </Section>
  )
}

export function BlogPostPage() {
  const { slug = '' } = useParams()
  const { data: post, isLoading } = usePost(slug)
  if (isLoading) return <Container><Skeleton className="my-16 h-72 sm:my-24 sm:h-96" /></Container>
  if (!post) return <EmptyState>Пост недоступен.</EmptyState>

  return (
    <>
      <SeoHead title={post.seo_title || post.title} description={post.seo_description || post.excerpt} path={`/blog/${post.slug}`} />
      <BlogPostView post={post} />
      {!!post.related?.length && (
        <Section>
          <Container className="max-w-3xl">
            <h2 className="font-heading text-2xl font-semibold">Ещё по теме</h2>
            <div className="mt-4 divide-y divide-white/[0.06] border-t border-white/[0.08]">
              {post.related.map((item) => (
                <Link key={String(item.id)} to={`/blog/${item.slug}`} className="link-text block py-4 text-[var(--muted)]">
                  {item.title}
                </Link>
              ))}
            </div>
          </Container>
        </Section>
      )}
    </>
  )
}

export function ContactPage() {
  const info = useContactInfo()

  return (
    <Section className="pt-10 sm:pt-14">
      <Container>
        <SeoHead title="Контакт" path="/contact" />
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <PageIntro
              title="Связаться"
              subtitle="Расскажите о задаче, аудитории и главном ограничении — отвечу в рабочие дни."
            />
            <div className="space-y-2 text-sm text-[var(--muted)]">
              {info.data?.email && (
                <p>
                  <a className="link-text" href={`mailto:${info.data.email}`}>{info.data.email}</a>
                </p>
              )}
              {info.data?.phone && (
                <p>
                  <a className="link-text" href={`tel:${info.data.phone}`}>{info.data.phone}</a>
                </p>
              )}
              {(info.data?.address || info.data?.city) && (
                <p>{[info.data.address, info.data.city, info.data.country].filter(Boolean).join(', ')}</p>
              )}
            </div>
          </div>
          <SurfacePanel className="p-4 sm:p-6">
            {/* Плагин Mail: CSRF, honeypot, rate limit, SMTP Mailer */}
            <ContactFormFromMail />
          </SurfacePanel>
        </div>
        {info.data?.map_embed && (
          <div className="mt-8 overflow-hidden rounded-[var(--radius)] sm:mt-10" dangerouslySetInnerHTML={{ __html: sanitizeEmbed(info.data.map_embed) }} />
        )}
      </Container>
    </Section>
  )
}

function ContactFormFromMail() {
  // Lazy import via dynamic component — module self-registers ContactFormWidget
  const [Node, setNode] = useState<null | typeof import('@/modules/mail').ContactFormWidget>(null)
  useEffect(() => {
    void import('@/modules/mail').then((m) => setNode(() => m.ContactFormWidget))
  }, [])
  if (!Node) return <p className="text-sm text-[var(--muted)]">Загрузка формы…</p>
  return <Node settings={{ title: '' }} />
}

export function PrivacyPage() {
  const { data } = usePage('privacy')
  return (
    <Section className="pt-10 sm:pt-14">
      <Container className="max-w-3xl">
        <SeoHead title={data?.seo_title || data?.title || 'Конфиденциальность'} path="/privacy" description={data?.seo_description} />
        <h1 className="font-heading text-[2.1rem] font-semibold tracking-[-0.04em] sm:text-4xl">{data?.title}</h1>
        <div className="mt-6 sm:mt-8"><RichText html={data?.content} /></div>
      </Container>
    </Section>
  )
}

export function TermsPage() {
  const { data } = usePage('terms')
  return (
    <Section className="pt-10 sm:pt-14">
      <Container className="max-w-3xl">
        <SeoHead title={data?.seo_title || data?.title || 'Условия использования'} path="/terms" description={data?.seo_description} />
        <h1 className="font-heading text-[2.1rem] font-semibold tracking-[-0.04em] sm:text-4xl">{data?.title || 'Условия использования'}</h1>
        <div className="mt-6 sm:mt-8"><RichText html={data?.content} /></div>
      </Container>
    </Section>
  )
}

export function NotFoundPage() {
  const { data } = useSite()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), 280)
    return () => window.clearTimeout(id)
  }, [q])

  const search = useQuery({
    queryKey: ['public-search', debounced],
    queryFn: async () => {
      type Hit = { type: string; label: string; href: string; subtitle?: string | null }
      const res = await api.get<{ data?: Hit[] } | Hit[]>(
        `/search?q=${encodeURIComponent(debounced)}&limit=10`,
      )
      if (Array.isArray(res)) return res
      return (res as { data?: Hit[] })?.data ?? []
    },
    enabled: debounced.length >= 2,
  })

  const results = search.data ?? []

  return (
    <Section className="pt-16 sm:pt-24">
      <Container className="max-w-xl">
        <SeoHead title="Не найдено" path="/not-found" noIndex />
        <p className="text-[var(--muted)]">404</p>
        <h1 className="mt-3 font-heading text-[2.2rem] font-semibold tracking-[-0.05em] sm:text-5xl">Такой страницы нет.</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">Попробуйте найти нужный раздел или вернитесь на главную.</p>

        <label className="mt-8 block space-y-2">
          <span className="sr-only">Поиск по сайту</span>
          <input
            className="w-full rounded-[var(--radius)] border border-white/10 bg-white/5 px-4 py-3 text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-white/25"
            placeholder="Поиск по сайту…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </label>

        {debounced.length >= 2 && (
          <div className="mt-3 space-y-1">
            {search.isFetching ? (
              <p className="text-sm text-[var(--muted)]">Ищем…</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Ничего не найдено.</p>
            ) : (
              results.map((item) => (
                <Link
                  key={`${item.type}-${item.href}`}
                  to={item.href}
                  className="block rounded-lg border border-white/5 px-3 py-2.5 transition hover:bg-white/[0.04]"
                >
                  <span className="text-sm text-[var(--text)]">{item.label}</span>
                  {item.subtitle ? (
                    <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{item.subtitle}</span>
                  ) : (
                    <span className="mt-0.5 block text-[11px] text-[var(--muted)]">{item.href}</span>
                  )}
                </Link>
              ))
            )}
          </div>
        )}

        <Link to="/" className="button mt-8 inline-flex">
          На главную{data?.site_settings?.site_name ? ` · ${data.site_settings.site_name}` : ''}
        </Link>
      </Container>
    </Section>
  )
}
