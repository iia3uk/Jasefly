import { Link } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import gsap from 'gsap'
import { Container, MediaImage, RichText, Section, SurfacePanel } from '@/components/ui'
import { ProjectGallery } from '@/modules/projects/components/ProjectGallery'
import { projectStatusLabel } from '@/modules/projects/projectStatus'
import { AppIcon } from '@/shared/icons'
import { sanitizeHtml } from '@/shared/sanitize'
import { mediaUrl } from '@/lib/api'
import { skillRankFromPercent, SKILL_SEGMENTS } from '@/shared/skillRank'
import type { BlogPost, Experience, HeroSettings, Profile, Project, Service, Testimonial } from '@/types'

export function asList(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : (item as { name?: string; title?: string }).name || (item as { title?: string }).title || ''))
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    try {
      return asList(JSON.parse(value))
    } catch {
      return value.split(',').map((x) => x.trim()).filter(Boolean)
    }
  }
  return []
}

export function formatRange(start?: string | null, end?: string | null, current?: boolean) {
  const from = start?.slice(0, 4) ?? ''
  const to = current ? 'н.в.' : (end?.slice(0, 4) ?? '')
  if (!from && !to) return ''
  return to ? `${from} — ${to}` : from
}

export function profilePortrait(p?: Partial<Profile> | null) {
  return p?.photo || p?.avatar || p?.photo_media_id || p?.avatar_media_id || null
}

type HeroData = Partial<HeroSettings>

export function HeroView({ hero, animate = true }: { hero: HeroData; animate?: boolean }) {
  const hasBg = !!(hero.background || hero.background_media_id)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const style = String(hero.animation_style || 'fade-up')

  useEffect(() => {
    if (!animate || !headlineRef.current || !hero.headline) return
    if (!style || style === 'none') return
    const words = headlineRef.current.querySelectorAll('span')
    const from =
      style === 'slide-in' ? { x: -36, opacity: 0 }
        : style === 'zoom-in' ? { scale: 0.88, opacity: 0 }
          : style === 'fade-in' || style === 'fade' ? { opacity: 0 }
            : { y: 28, opacity: 0 } // fade-up default
    const to =
      style === 'slide-in' ? { x: 0, opacity: 1 }
        : style === 'zoom-in' ? { scale: 1, opacity: 1 }
          : { y: 0, x: 0, scale: 1, opacity: 1 }
    gsap.fromTo(words, from, { ...to, duration: 0.7, stagger: 0.05, ease: 'power3.out' })
  }, [animate, hero.headline, style])

  return (
    <Section className="relative flex min-h-[min(72vh,36rem)] items-center overflow-hidden !py-0 sm:min-h-[min(84vh,52rem)]">
      {hasBg && (
        <MediaImage
          media={hero.background ?? hero.background_media_id}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[68%_center] sm:object-center"
          aria-hidden
          loading="eager"
        />
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: hasBg
            ? 'linear-gradient(to right, color-mix(in srgb, var(--background) 94%, transparent) 0%, color-mix(in srgb, var(--background) 72%, transparent) 42%, color-mix(in srgb, var(--background) 28%, transparent) 72%, transparent 100%), linear-gradient(to top, color-mix(in srgb, var(--background) 88%, transparent) 0%, transparent 38%), radial-gradient(900px 420px at 12% 20%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 58%)'
            : 'radial-gradient(900px 420px at 15% 10%, color-mix(in srgb, var(--primary) 20%, transparent), transparent 60%), radial-gradient(700px 360px at 90% 30%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 55%)',
        }}
        aria-hidden
      />
      <Container className="relative w-full py-10 sm:py-12 lg:py-14">
        {hero.badge_text ? (
          <p className="mb-4 text-sm font-medium tracking-[0.02em] text-[var(--accent)] sm:mb-6">{String(hero.badge_text)}</p>
        ) : null}
        <h1 ref={headlineRef} className="max-w-5xl font-heading text-[2.15rem] font-semibold leading-[1.05] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
          {(String(hero.headline || 'Заголовок')).split(' ').map((word, i) => (
            <span key={`${word}-${i}`} className="mr-[0.28em] inline-block">{word}</span>
          ))}
        </h1>
        {hero.subheadline ? (
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)] sm:mt-7 sm:text-lg sm:leading-8">{String(hero.subheadline)}</p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:gap-4">
          {hero.primary_cta_label && hero.primary_cta_href ? (
            <Link className="button w-full sm:w-auto" to={String(hero.primary_cta_href)}>{String(hero.primary_cta_label)}</Link>
          ) : hero.primary_cta_label ? (
            <span className="button w-full sm:w-auto">{String(hero.primary_cta_label)}</span>
          ) : null}
          {hero.secondary_cta_label && hero.secondary_cta_href ? (
            <Link className="button button-ghost w-full sm:w-auto" to={String(hero.secondary_cta_href)}>{String(hero.secondary_cta_label)}</Link>
          ) : hero.secondary_cta_label ? (
            <span className="button button-ghost w-full sm:w-auto">{String(hero.secondary_cta_label)}</span>
          ) : null}
        </div>
      </Container>
    </Section>
  )
}

export function ProfileHeroView({
  profile,
  bare = false,
}: {
  profile: Partial<Profile>
  /** Without Section/Container — for builder sections that already wrap content. */
  bare?: boolean
}) {
  const photo = profilePortrait(profile)
  const body = (
    <>
      {/* About hero: top-aligned columns — never items-end (that pinned text under the photo). */}
      <div className="grid items-start gap-8 sm:gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
        <div className="min-w-0 lg:pt-6">
          {profile.job_title ? (
            <p className="max-w-xl text-sm font-medium leading-6 tracking-[0.02em] text-[var(--accent)]">
              {String(profile.job_title)}
            </p>
          ) : null}
          <h1 className="mt-4 font-heading text-[2.15rem] font-semibold leading-[1.05] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
            {String(profile.name || 'Обо мне')}
          </h1>
          {profile.short_bio ? (
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">{String(profile.short_bio)}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted)]">
            {profile.location ? <span>{String(profile.location)}</span> : null}
            {profile.availability_status ? <span>{String(profile.availability_status)}</span> : null}
            {profile.years_experience != null ? (
              <span>{String(profile.years_experience)}+ лет практики</span>
            ) : null}
          </div>
          {profile.resume_media_id ? (
            <a
              className="link-text mt-8 inline-flex items-center gap-2 text-sm"
              href={mediaUrl(profile.resume_media_id)}
            >
              <Download size={16} /> Скачать резюме
            </a>
          ) : null}
        </div>
        {photo ? (
          <div className="relative w-full max-w-sm justify-self-start sm:max-w-md lg:max-w-none lg:justify-self-end">
            <MediaImage
              media={photo}
              alt={String(profile.name ?? '')}
              className="aspect-[4/5] w-full rounded-[calc(var(--radius)+4px)] object-cover"
            />
          </div>
        ) : null}
      </div>
      {profile.bio ? (
        <div className="mt-16 max-w-3xl border-t border-white/[0.06] pt-12 sm:mt-20 sm:pt-14">
          <p className="mb-8 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Обо мне</p>
          <div className="prose prose-lg"><RichText html={String(profile.bio)} /></div>
        </div>
      ) : null}
    </>
  )
  if (bare) return <div className="relative overflow-hidden">{body}</div>
  return (
    <Section className="relative overflow-hidden pt-10 pb-6 sm:pt-14">
      <Container>{body}</Container>
    </Section>
  )
}

export function BlogPostView({ post }: { post: Partial<BlogPost> }) {
  const linkedProject = post.project
  return (
    <Section className="pt-10 sm:pt-14">
      <Container className="max-w-3xl">
        {linkedProject?.slug ? (
          <Link
            to={`/projects/${linkedProject.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-4 transition hover:decoration-[var(--accent)]"
          >
            К проекту · {String(linkedProject.title || linkedProject.slug)}
          </Link>
        ) : null}
        <h1 className={`font-heading text-[2.1rem] font-semibold tracking-[-0.04em] sm:text-4xl lg:text-5xl ${linkedProject?.slug ? 'mt-3' : ''}`}>
          {String(post.title || 'Заголовок поста')}
        </h1>
        <p className="mt-4 text-sm text-[var(--muted)]">
          {post.reading_time ? `${post.reading_time} мин` : null}
          {post.published_at ? ` · ${new Date(String(post.published_at)).toLocaleDateString('ru-RU')}` : null}
        </p>
        {(post.cover || post.cover_media_id) ? (
          <MediaImage
            media={post.cover ?? post.cover_media_id}
            alt={String(post.title ?? '')}
            lightbox
            className="mt-6 w-full rounded-[var(--radius)] object-contain sm:mt-8"
          />
        ) : null}
        {post.excerpt ? <p className="mt-6 text-[var(--muted)]">{String(post.excerpt)}</p> : null}
        <div className="mt-6 sm:mt-8"><RichText html={String(post.content || '')} /></div>
      </Container>
    </Section>
  )
}

export function ProjectDetailView({ project }: { project: Partial<Project> }) {
  const links = [
    ['Website', project.website_url],
    ['GitHub', project.github_url],
    ['Steam', project.steam_url],
    ['Itch.io', project.itch_url],
    ['Google Play', project.google_play_url],
    ['App Store', project.app_store_url],
    [project.download_label || 'Download', project.download_url],
  ].filter(([, url]) => !!url) as Array<[string, string]>

  const techs = asList(project.technologies)
  const features = Array.isArray(project.features) ? project.features : asList(project.features)
  const media = Array.isArray(project.media) ? project.media : []
  const timeline = Array.isArray(project.timeline) ? project.timeline : []

  return (
    <Section className="pt-10 sm:pt-14">
      <Container>
        {project.project_status ? (
          <p className="text-sm text-[var(--accent)]">
            {projectStatusLabel(String(project.project_status))}
          </p>
        ) : null}
        <h1 className="mt-3 max-w-4xl font-heading text-[2.1rem] font-semibold tracking-[-0.05em] sm:text-5xl lg:text-6xl">
          {String(project.title || 'Проект')}
        </h1>
        {project.short_description ? (
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)] sm:mt-5 sm:text-lg sm:leading-8">
            {String(project.short_description)}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--muted)] sm:mt-6">
          {project.role ? <span>Роль: {String(project.role)}</span> : null}
          {project.team_size ? <span>Команда: {String(project.team_size)}</span> : null}
          {project.completion_date ? <span>Завершён: {String(project.completion_date)}</span> : null}
        </div>
        {(project.cover || project.cover_media_id) ? (
          <MediaImage
            media={project.cover ?? project.cover_media_id}
            alt={String(project.title ?? '')}
            className="mt-8 aspect-[16/10] w-full rounded-[calc(var(--radius)+4px)] object-cover sm:mt-10 sm:aspect-[16/9]"
          />
        ) : null}
        {!!media.length && <ProjectGallery items={media as never} title="Галерея" />}
        {(project.youtube_url || project.video_url) && (
          <div className="mt-6 aspect-video overflow-hidden rounded-[var(--radius)] bg-black/40 sm:mt-8">
            {project.youtube_url ? (
              <iframe
                className="h-full w-full"
                src={String(project.youtube_url).replace('watch?v=', 'embed/')}
                title={String(project.title || 'video')}
                allowFullScreen
              />
            ) : (
              <video className="h-full w-full" src={String(project.video_url)} controls />
            )}
          </div>
        )}
        <div className="mt-8 max-w-3xl sm:mt-10">
          <RichText html={String(project.content || project.description || '')} />
        </div>
        <div className="mt-10 grid gap-4 sm:mt-12 md:grid-cols-2">
          {!!techs.length && (
            <SurfacePanel className="p-5 sm:p-6">
              <h2 className="font-heading text-xl font-semibold">Стек</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{techs.join(' · ')}</p>
            </SurfacePanel>
          )}
          {!!features.length && (
            <SurfacePanel className="p-5 sm:p-6">
              <h2 className="font-heading text-xl font-semibold">Особенности</h2>
              <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                {features.map((feature, i) => (
                  <li key={typeof feature === 'string' ? feature : (feature as { title?: string }).title || i}>
                    {typeof feature === 'string' ? feature : (feature as { title?: string }).title}
                  </li>
                ))}
              </ul>
            </SurfacePanel>
          )}
        </div>
        {!!timeline.length && (
          <div className="mt-10 sm:mt-12">
            <h2 className="font-heading text-2xl font-semibold">Таймлайн</h2>
            <div className="mt-4 divide-y divide-white/[0.06] border-t border-white/[0.08]">
              {timeline.map((event: { id?: string | number; event_date?: string; title?: string; description?: string }, i: number) => (
                <div key={event.id || i} className="grid gap-2 py-5 sm:grid-cols-[7.5rem_1fr] sm:gap-8">
                  <p className="text-sm text-[var(--muted)]">{event.event_date}</p>
                  <div>
                    <h3 className="font-medium">{event.title}</h3>
                    {event.description && <p className="mt-2 text-sm text-[var(--muted)]">{event.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {project.challenges ? (
          <div className="mt-10 sm:mt-12">
            <h2 className="font-heading text-2xl font-semibold">Сложности</h2>
            <div className="mt-4 max-w-3xl"><RichText html={String(project.challenges)} /></div>
          </div>
        ) : null}
        {!!links.length && (
          <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:gap-4">
            {links.map(([label, url]) => (
              <a key={label} href={url} target="_blank" rel="noreferrer" className="button button-ghost w-full sm:w-auto">
                {label} <ExternalLink size={14} />
              </a>
            ))}
          </div>
        )}
        {!!project.related_posts?.length && (
          <div className="mt-10 sm:mt-12">
            <h2 className="font-heading text-2xl font-semibold">Записи о проекте</h2>
            <div className="mt-4 divide-y divide-white/[0.06] border-t border-white/[0.08]">
              {project.related_posts.map((item) => (
                <Link
                  key={String(item.id)}
                  to={`/blog/${item.slug}`}
                  className="link-row group block py-5"
                >
                  <h3 className="font-heading text-lg font-semibold tracking-[-0.03em] transition group-hover:text-[var(--accent)]">
                    {item.title}
                  </h3>
                  {item.excerpt ? <p className="mt-2 text-sm text-[var(--muted)]">{item.excerpt}</p> : null}
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {item.reading_time ? `${item.reading_time} мин` : null}
                    {item.published_at ? ` · ${new Date(String(item.published_at)).toLocaleDateString('ru-RU')}` : null}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Container>
    </Section>
  )
}

export function ExperienceItemView({ item }: { item: Partial<Experience> }) {
  return (
    <article className="grid gap-3 border-t border-white/[0.08] py-8 sm:grid-cols-[7.5rem_1fr] sm:gap-8 md:gap-10">
      <p className="pt-0 text-sm tabular-nums text-[var(--muted)] sm:pt-1">
        {formatRange(
          item.start_date as string | undefined,
          item.end_date as string | undefined,
          Boolean(item.is_current),
        )}
      </p>
      <div className="min-w-0">
        <h3 className="font-heading text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{String(item.role || 'Роль')}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {String(item.company || '')}
          {item.location ? ` · ${item.location}` : ''}
        </p>
        {item.description ? <div className="mt-4 max-w-3xl"><RichText html={String(item.description)} /></div> : null}
        {!!asList(item.technologies).length && (
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{asList(item.technologies).join(' · ')}</p>
        )}
      </div>
    </article>
  )
}

export function EducationItemView({ item }: { item: Record<string, unknown> }) {
  return (
    <article className="grid gap-3 border-t border-white/[0.08] py-8 md:grid-cols-[7.5rem_1fr] md:gap-10">
      <p className="text-sm tabular-nums text-[var(--muted)]">
        {formatRange(item.start_date as string, item.end_date as string)}
      </p>
      <div>
        <h3 className="font-heading text-xl font-semibold">{String(item.degree || 'Степень')}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {String(item.institution || '')}
          {item.field_of_study ? ` · ${item.field_of_study}` : ''}
        </p>
        {item.description ? (
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">{String(item.description)}</p>
        ) : null}
      </div>
    </article>
  )
}

export function ServiceCardView({ service, index = 0 }: { service: Partial<Service>; index?: number }) {
  const purchasable = Boolean(service.is_purchasable) && service.price != null && Number(service.price) > 0
  const priceText = service.price_label
    || (purchasable ? `${service.price} ${service.currency === 'RUB' || !service.currency ? '₽' : service.currency}` : '')
  return (
    <SurfacePanel className="p-5 sm:p-8">
      <span className="font-heading text-[0.65rem] tracking-[0.18em] text-[var(--muted)]">
        {String(index + 1).padStart(2, '0')}
      </span>
      <h2 className="mt-3 font-heading text-2xl font-semibold tracking-[-0.03em]">{String(service.title || 'Услуга')}</h2>
      {service.short_description ? <p className="mt-3 text-[var(--muted)]">{String(service.short_description)}</p> : null}
      {service.description ? <div className="mt-4"><RichText html={String(service.description)} /></div> : null}
      {!!asList(service.features).length && (
        <ul className="mt-5 space-y-2 text-sm text-[var(--muted)]">
          {asList(service.features).map((f) => <li key={f}>· {f}</li>)}
        </ul>
      )}
      {priceText ? <p className="mt-4 text-sm text-[var(--accent)]">{String(priceText)}</p> : null}
      {service.duration_label ? <p className="mt-1 text-xs text-[var(--muted)]">{String(service.duration_label)}</p> : null}
      {purchasable && service.id != null ? (
        <a href={`/payment?item=service:${service.id}`} className="mt-5 inline-flex text-sm link-text">
          Заказать
        </a>
      ) : null}
    </SurfacePanel>
  )
}

export function TestimonialCardView({ item }: { item: Partial<Testimonial> }) {
  return (
    <SurfacePanel className="p-6 sm:p-8">
      {item.rating != null ? (
        <p className="mb-3 text-sm text-[var(--accent)]">{'★'.repeat(Math.min(5, Number(item.rating) || 0))}</p>
      ) : null}
      <p className="text-base leading-8 text-[var(--text)] sm:text-lg">“{String(item.content || '')}”</p>
      <p className="mt-6 text-sm text-[var(--muted)]">
        {String(item.author_name || '')}
        {(item.author_role || item.author_company) &&
          ` — ${[item.author_role, item.author_company].filter(Boolean).join(', ')}`}
      </p>
    </SurfacePanel>
  )
}

export function SkillItemView({ form }: { form: Record<string, unknown> }) {
  const rank = skillRankFromPercent(Number(form.percentage || 0))
  return (
    <div className="max-w-lg">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 font-heading text-lg font-medium tracking-[-0.02em]">
          {form.icon != null && String(form.icon).trim() !== '' && <AppIcon name={String(form.icon)} size={18} />}
          {String(form.name || 'Навык')}
        </span>
        <span className="shrink-0 font-heading text-xs font-semibold tracking-[0.12em] uppercase text-[var(--accent)]">
          {rank.label}
        </span>
      </div>
      <div className="flex gap-1 sm:gap-1.5" role="img" aria-label={`${form.name}: ${rank.label}`}>
        {Array.from({ length: SKILL_SEGMENTS }, (_, seg) => (
          <span
            key={seg}
            className={`h-2.5 flex-1 rounded-[2px] sm:h-3 ${
              seg < rank.filled
                ? 'bg-[linear-gradient(180deg,var(--accent),var(--primary))]'
                : 'bg-white/[0.08]'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

export function NavItemView({ form }: { form: Record<string, unknown> }) {
  return (
    <nav className="flex flex-wrap items-center gap-7 border-b border-white/[0.06] bg-[color:var(--background)]/75 px-6 py-5 backdrop-blur-xl">
      <span className="font-heading text-[0.95rem] font-semibold tracking-[-0.02em]">Сайт</span>
      <span className="link-nav text-sm text-[var(--text)]">{String(form.label || 'Пункт меню')}</span>
      <span className="text-xs text-[var(--muted)]">{String(form.href || '/')}</span>
    </nav>
  )
}

export function StatisticItemView({ form }: { form: Record<string, unknown> }) {
  return (
    <div className="min-w-0 border-y border-white/[0.08] py-8">
      <p className="font-heading text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
        {String(form.value ?? '')}{String(form.suffix ?? '')}
      </p>
      <p className="mt-2 text-sm text-[var(--muted)]">{String(form.label || '')}</p>
    </div>
  )
}

export function SocialLinkView({ form }: { form: Record<string, unknown> }) {
  return (
    <a
      href={String(form.url || '#')}
      className="link-text inline-flex items-center gap-1.5 text-sm text-[var(--muted)]"
      target="_blank"
      rel="noreferrer"
    >
      {form.icon ? <AppIcon name={String(form.icon)} size={14} fallback={false} /> : null}
      {String(form.label || form.platform || form.url || 'Соцсеть')}
    </a>
  )
}

export function FooterPreviewView({ form }: { form: Record<string, unknown> }) {
  const year = new Date().getFullYear()
  const copyright = sanitizeHtml(String(form.copyright_text || '© {year}').replace('{year}', String(year)))
  const tagline = sanitizeHtml(String(form.tagline || ''))
  return (
    <footer className="border-t border-white/[0.06] pt-12 pb-8">
      <Container>
        {tagline ? (
          <p
            className="max-w-sm text-sm leading-6 text-[var(--muted)] [&_a]:text-[var(--accent)]"
            dangerouslySetInnerHTML={{ __html: tagline }}
          />
        ) : null}
        {form.show_social ? <p className="mt-4 text-xs text-[var(--accent)]">Соцсети: показаны</p> : null}
        {copyright ? (
          <p
            className="mt-10 text-sm text-[var(--muted)] [&_a]:text-[var(--accent)]"
            dangerouslySetInnerHTML={{ __html: copyright }}
          />
        ) : null}
      </Container>
    </footer>
  )
}

export function ContactInfoView({ form }: { form: Record<string, unknown> }) {
  return (
    <Section className="pt-10 sm:pt-14">
      <Container>
        <h1 className="font-heading text-[2.1rem] font-semibold tracking-[-0.05em] sm:text-5xl">Связаться</h1>
        <div className="mt-8 space-y-2 text-sm text-[var(--muted)]">
          {form.email ? <p><a className="link-text" href={`mailto:${form.email}`}>{String(form.email)}</a></p> : null}
          {form.phone ? <p><a className="link-text" href={`tel:${form.phone}`}>{String(form.phone)}</a></p> : null}
          {[form.address, form.city, form.country].filter(Boolean).length > 0 && (
            <p>{[form.address, form.city, form.country].filter(Boolean).join(', ')}</p>
          )}
        </div>
        {form.form_success_message ? (
          <SurfacePanel className="mt-8 p-5 text-[var(--muted)]">{String(form.form_success_message)}</SurfacePanel>
        ) : null}
      </Container>
    </Section>
  )
}

export function HomepageSectionView({ form }: { form: Record<string, unknown> }) {
  return (
    <Section>
      <Container>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{String(form.section_key || 'section')}</p>
          <h2 className="mt-3 font-heading text-[1.75rem] font-semibold tracking-[-0.04em] sm:text-3xl">
            {String(form.title || 'Секция')}
          </h2>
          {form.subtitle ? <p className="mt-3 max-w-xl text-[var(--muted)]">{String(form.subtitle)}</p> : null}
        </div>
        {form.content ? <div className="max-w-3xl"><RichText html={String(form.content)} /></div> : null}
        {form.cta_label ? (
          form.cta_href ? (
            <Link to={String(form.cta_href)} className="button mt-8 inline-flex">{String(form.cta_label)}</Link>
          ) : (
            <span className="button mt-8 inline-flex">{String(form.cta_label)}</span>
          )
        ) : null}
        {form.is_visible === false && (
          <p className="mt-4 text-xs text-amber-400">Секция скрыта (не видна на сайте)</p>
        )}
      </Container>
    </Section>
  )
}
