import { Link } from 'react-router-dom'
import { Container, MediaImage, RichText, Section, SectionHeading, SurfacePanel } from '@/components/ui'
import {
  useBlog,
  useContactInfo,
  useContactMutation,
  useExperience,
  useProfile,
  useProjects,
  useServices,
  useSkills,
  useStatistics,
  useTestimonials,
} from '@/hooks/useApi'
import { profilePortrait } from '@/shared/views'
import { SkillsBlock } from '@/shared/SkillsBlock'
import { ProjectCard } from '@/modules/projects/components/ProjectCard'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { EditableButton, EditableText } from '@/builder/edit/Editable'
import { readStyles, stylesToCss, readFieldStyles } from '@/builder/edit/StyleFields'
import { useBuilderEdit } from '@/builder/context/BuilderEditContext'
import { useState, type FormEvent } from 'react'
import clsx from 'clsx'

function fields(...items: SettingsField[]) {
  return items
}

function pickSetting(settings: Record<string, unknown>, key: string, fallback: unknown = '') {
  const v = settings[key]
  if (v != null && String(v) !== '') return v
  return fallback
}

function HeroBgHitbox({ editMode }: { editMode?: boolean }) {
  const ctx = useBuilderEdit()
  if (!editMode || !ctx) return null
  const selected = ctx.selectedId === ctx.elementId && ctx.selectedPart === 'background_media_id'
  return (
    <button
      type="button"
      data-builder-editable
      data-field="background_media_id"
      className={clsx(
        'absolute right-3 top-3 z-20 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide',
        selected
          ? 'bg-[var(--accent,#8eb6ff)] text-black'
          : 'bg-black/55 text-zinc-300 ring-1 ring-white/20 hover:bg-black/70',
      )}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ctx.onSelectElement(ctx.elementId, { part: 'background_media_id' })
      }}
    >
      Фон
    </button>
  )
}

function HeroWidget({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  // Layout settings are the source of truth (CMS hero is baked into settings on open/save).
  const styles = stylesToCss(readStyles(settings))
  const align = String(readStyles(settings).textAlign || 'left')
  const items =
    align === 'center' ? 'items-center text-center' : align === 'right' ? 'items-end text-right' : 'items-start text-left'
  const justify =
    align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'

  const badge = String(pickSetting(settings, 'badge_text', ''))
  const headline = String(pickSetting(settings, 'headline', 'Заголовок'))
  const subheadline = String(pickSetting(settings, 'subheadline', ''))
  const primaryLabel = String(pickSetting(settings, 'primary_cta_label', ''))
  const primaryHref = String(pickSetting(settings, 'primary_cta_href', ''))
  const secondaryLabel = String(pickSetting(settings, 'secondary_cta_label', ''))
  const secondaryHref = String(pickSetting(settings, 'secondary_cta_href', ''))
  const bgMedia = settings.background_media_id ?? settings.background ?? null
  const hasBg = !!bgMedia
  const bgFieldCss = stylesToCss(readFieldStyles(settings, 'background_media_id'))

  return (
    <Section className="relative flex min-h-[min(72vh,36rem)] items-center overflow-hidden !py-0 sm:min-h-[min(84vh,52rem)]" style={styles}>
      {hasBg && (
        <MediaImage
          media={bgMedia as never}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[68%_center] sm:object-center"
          style={bgFieldCss}
          aria-hidden
          loading="eager"
        />
      )}
      <HeroBgHitbox editMode={editMode} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: hasBg
            ? 'linear-gradient(to right, color-mix(in srgb, var(--background) 94%, transparent) 0%, color-mix(in srgb, var(--background) 72%, transparent) 42%, color-mix(in srgb, var(--background) 28%, transparent) 72%, transparent 100%), linear-gradient(to top, color-mix(in srgb, var(--background) 88%, transparent) 0%, transparent 38%), radial-gradient(900px 420px at 12% 20%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 58%)'
            : 'radial-gradient(900px 420px at 15% 10%, color-mix(in srgb, var(--primary) 20%, transparent), transparent 60%), radial-gradient(700px 360px at 90% 30%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 55%)',
        }}
        aria-hidden
      />
      <Container className={clsx('relative flex w-full flex-col py-10 sm:py-12 lg:py-14', items)}>
        {(badge || editMode) && (
          <EditableText
            field="badge_text"
            label="Бейдж"
            value={badge}
            as="p"
            className="mb-4 text-sm font-medium tracking-[0.02em] text-[var(--accent)] sm:mb-6"
            placeholder="Бейдж"
          />
        )}
        <EditableText
          field="headline"
          label="Заголовок"
          value={headline}
          as="h1"
          className="max-w-5xl font-heading text-[2.15rem] font-semibold leading-[1.05] tracking-[-0.055em] sm:text-6xl lg:text-7xl"
        />
        {(subheadline || editMode) && (
          <EditableText
            field="subheadline"
            label="Подзаголовок"
            value={subheadline}
            as="p"
            multiline
            className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)] sm:mt-7 sm:text-lg sm:leading-8"
            placeholder="Подзаголовок"
          />
        )}
        <div className={clsx('mt-8 flex w-full flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:gap-4', justify)}>
          {(primaryLabel || editMode) && (
            <EditableButton
              labelField="primary_cta_label"
              hrefField="primary_cta_href"
              label={primaryLabel}
              href={primaryHref}
              className="w-full sm:w-auto"
            />
          )}
          {(secondaryLabel || editMode) && (
            <EditableButton
              labelField="secondary_cta_label"
              hrefField="secondary_cta_href"
              label={secondaryLabel}
              href={secondaryHref}
              variant="ghost"
              className="w-full sm:w-auto"
            />
          )}
        </div>
      </Container>
    </Section>
  )
}

/** Content-only: LayoutRenderer already provides section + site Container. */
function ProjectsGridWidget({ settings }: { settings: Record<string, unknown> }) {
  const featuredOnly = Boolean(settings.featured_only)
  const featured = useProjects(true)
  const all = useProjects(false)
  const limit = Number(settings.limit || 6)
  const list = (featuredOnly && featured.data?.length ? featured.data : all.data)?.slice(0, limit) ?? []
  return (
    <>
      {(settings.title || settings.subtitle) ? (
        <SectionHeading title={String(settings.title || 'Проекты')} subtitle={settings.subtitle ? String(settings.subtitle) : undefined} />
      ) : null}
      <div className="grid gap-x-6 gap-y-10 sm:gap-x-8 sm:gap-y-12 md:grid-cols-2">
        {list.map((p) => <ProjectCard key={String(p.id)} project={p} />)}
      </div>
    </>
  )
}

function SkillsWidget({ settings }: { settings: Record<string, unknown> }) {
  const { data } = useSkills()
  const preset = String(settings.preset || 'tabs') as 'tabs' | 'stacked' | 'minimal' | 'grid'
  const size = String(settings.size || 'sm') as 'sm' | 'md' | 'lg'
  const showRanks = settings.show_ranks !== false
  return (
    <>
      {(settings.title || settings.subtitle) ? (
        <SectionHeading title={String(settings.title || 'Навыки')} subtitle={settings.subtitle ? String(settings.subtitle) : undefined} />
      ) : null}
      <SkillsBlock
        categories={data}
        preset={preset}
        size={size}
        showRanks={showRanks}
      />
    </>
  )
}

function ExperienceWidget({ settings }: { settings: Record<string, unknown> }) {
  const { data } = useExperience()
  return (
    <>
      {(settings.title || settings.subtitle) ? (
        <SectionHeading title={String(settings.title || 'Опыт')} subtitle={settings.subtitle ? String(settings.subtitle) : undefined} />
      ) : null}
      <div className="divide-y divide-white/[0.06] border-t border-white/[0.08]">
        {data?.map((item) => (
          <article key={String(item.id)} className="grid gap-3 py-8 sm:grid-cols-[7.5rem_1fr] sm:gap-8">
            <p className="text-sm tabular-nums text-[var(--muted)]">
              {item.start_date?.slice(0, 4)} — {item.is_current ? 'н.в.' : item.end_date?.slice(0, 4)}
            </p>
            <div>
              <h3 className="font-heading text-xl font-semibold">{item.role}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{item.company}{item.location ? ` · ${item.location}` : ''}</p>
              <div className="mt-3"><RichText html={item.description} /></div>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function ServicesWidget({ settings }: { settings: Record<string, unknown> }) {
  const { data } = useServices()
  return (
    <>
      {(settings.title || settings.subtitle) ? (
        <SectionHeading title={String(settings.title || 'Услуги')} subtitle={settings.subtitle ? String(settings.subtitle) : undefined} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((service, i) => (
          <SurfacePanel key={String(service.id)} className="p-5 sm:p-7">
            <span className="font-heading text-[0.65rem] tracking-[0.18em] text-[var(--muted)]">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-3 font-heading text-xl font-semibold">{service.title}</h3>
            <p className="mt-3 text-sm text-[var(--muted)]">{service.short_description}</p>
          </SurfacePanel>
        ))}
      </div>
    </>
  )
}

function TestimonialsWidget({ settings }: { settings: Record<string, unknown> }) {
  const { data } = useTestimonials()
  return (
    <>
      {(settings.title || settings.subtitle) ? (
        <SectionHeading title={String(settings.title || 'Отзывы')} subtitle={settings.subtitle ? String(settings.subtitle) : undefined} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((item) => (
          <SurfacePanel key={String(item.id)} className="p-6 sm:p-8">
            <p className="text-base leading-8 sm:text-lg">“{item.content}”</p>
            <p className="mt-6 text-sm text-[var(--muted)]">
              {item.author_name}
              {(item.author_role || item.author_company) &&
                ` — ${[item.author_role, item.author_company].filter(Boolean).join(', ')}`}
            </p>
          </SurfacePanel>
        ))}
      </div>
    </>
  )
}

function BlogListWidget({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const { data } = useBlog()
  const limit = Number(settings.limit || 3)
  return (
    <>
      {(settings.title || settings.subtitle) ? (
        <SectionHeading title={String(settings.title || 'Блог')} subtitle={settings.subtitle ? String(settings.subtitle) : undefined} />
      ) : null}
      <div className="divide-y divide-white/[0.06] border-t border-white/[0.08]">
        {data?.slice(0, limit).map((post) => (
          editMode ? (
            <div key={String(post.id)} className="block py-7 sm:py-8">
              <h3 className="font-heading text-xl font-semibold sm:text-2xl">{post.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{post.excerpt}</p>
            </div>
          ) : (
            <Link key={String(post.id)} to={`/blog/${post.slug}`} className="link-row group block py-7 sm:py-8">
              <h3 className="font-heading text-xl font-semibold transition group-hover:text-[var(--accent)] sm:text-2xl">{post.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{post.excerpt}</p>
            </Link>
          )
        ))}
      </div>
    </>
  )
}

function ContactFormWidget({ settings }: { settings: Record<string, unknown> }) {
  const info = useContactInfo()
  const mutation = useContactMutation()
  const [status, setStatus] = useState('')
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    if (data.website) return
    try {
      const result = await mutation.mutateAsync(data)
      setStatus(result.message || info.data?.form_success_message || 'Сообщение отправлено')
      form.reset()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось отправить')
    }
  }
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div>
        <h2 className="font-heading text-3xl font-semibold">{String(settings.title || 'Связаться')}</h2>
        {settings.subtitle ? <p className="mt-4 text-[var(--muted)]">{String(settings.subtitle)}</p> : null}
        <div className="mt-6 space-y-2 text-sm text-[var(--muted)]">
          {info.data?.email && <p>{info.data.email}</p>}
          {info.data?.phone && <p>{info.data.phone}</p>}
        </div>
      </div>
      <SurfacePanel className="p-4 sm:p-6">
        <form className="space-y-3" onSubmit={onSubmit}>
          <input name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <input required name="name" placeholder="Имя" />
          <input required type="email" name="email" placeholder="Email" />
          <textarea required name="message" placeholder="Сообщение" rows={5} />
          <button type="submit" className="button" disabled={mutation.isPending}>Отправить</button>
          {status && <p className="text-sm text-[var(--muted)]">{status}</p>}
        </form>
      </SurfacePanel>
    </div>
  )
}

function ProfileCardWidget({ settings }: { settings: Record<string, unknown> }) {
  const { data: profile } = useProfile()
  const { data: stats } = useStatistics()
  // Text comes from layout settings (CMS about_preview is baked on open/save).
  const title = String(settings.title || 'Обо мне')
  const subtitle = String(settings.subtitle || '')
  const ctaHref = String(settings.cta_href || '/about')
  const ctaLabel = String(settings.cta_label || 'Подробнее')
  const portrait = profilePortrait(profile)

  if (!profile) {
    return <p className="text-[var(--muted)]">Профиль…</p>
  }

  return (
    <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {portrait ? (
        <MediaImage
          media={portrait}
          alt={profile.name ?? ''}
          className="aspect-[4/5] w-full max-w-sm rounded-[calc(var(--radius)+4px)] object-cover lg:max-w-none"
        />
      ) : null}
      <div>
        <SectionHeading
          title={title}
          subtitle={subtitle || undefined}
          action={
            ctaHref ? (
              <Link to={ctaHref} className="link-text text-sm">
                {ctaLabel}
              </Link>
            ) : null
          }
        />
        {!!stats?.length && (
          <div className="mt-8 grid grid-cols-2 gap-6 border-y border-white/[0.08] py-8 sm:gap-8 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={String(stat.id)} className="min-w-0">
                <p className="font-heading text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  {stat.value}{stat.suffix}
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CtaBannerWidget({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const label = String(settings.cta_label || '')
  const href = String(settings.cta_href || '/contact')
  return (
    <SurfacePanel className="px-5 py-10 sm:px-10 sm:py-12">
      <EditableText
        field="title"
        label="Заголовок"
        value={String(settings.title || 'Готовы начать?')}
        as="h2"
        className="max-w-2xl font-heading text-[1.75rem] font-semibold sm:text-3xl"
      />
      {(settings.subtitle || editMode) ? (
        <EditableText
          field="subtitle"
          label="Подзаголовок"
          value={String(settings.subtitle || '')}
          as="p"
          multiline
          className="mt-4 max-w-xl text-[var(--muted)]"
          placeholder="Подзаголовок"
        />
      ) : null}
      {(label || editMode) ? (
        <div className="mt-8">
          <EditableButton
            labelField="cta_label"
            hrefField="cta_href"
            label={label}
            href={href}
            className="inline-flex"
          />
        </div>
      ) : null}
    </SurfacePanel>
  )
}

export function registerPortfolioWidgets() {
  const titleFields = fields(
    { key: 'title', label: 'Заголовок', type: 'text' },
    { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
  )

  registerWidget({
    type: 'hero',
    label: 'Hero',
    category: 'portfolio',
    plugin: 'portfolio',
    defaultSettings: {
      badge_text: '',
      headline: '',
      subheadline: '',
      primary_cta_label: '',
      primary_cta_href: '',
      secondary_cta_label: '',
      secondary_cta_href: '',
      background_media_id: '',
    },
    settingsFields: fields(
      { key: 'badge_text', label: 'Бейдж', type: 'text' },
      { key: 'headline', label: 'Заголовок', type: 'text' },
      { key: 'subheadline', label: 'Подзаголовок', type: 'textarea' },
      { key: 'primary_cta_label', label: 'Кнопка 1 — текст', type: 'text' },
      { key: 'primary_cta_href', label: 'Кнопка 1 — ссылка', type: 'url' },
      { key: 'secondary_cta_label', label: 'Кнопка 2 — текст', type: 'text' },
      { key: 'secondary_cta_href', label: 'Кнопка 2 — ссылка', type: 'url' },
      { key: 'background_media_id', label: 'Фон (media id)', type: 'media' },
    ),
    Render: HeroWidget,
  })

  registerWidget({
    type: 'projects-grid',
    label: 'Сетка проектов',
    category: 'portfolio',
    defaultSettings: { title: 'Проекты', subtitle: '', limit: 6, featured_only: false },
    settingsFields: [...titleFields, { key: 'limit', label: 'Лимит', type: 'number' }, { key: 'featured_only', label: 'Только избранные', type: 'toggle' }],
    Render: ProjectsGridWidget,
  })

  registerWidget({
    type: 'skills',
    label: 'Навыки',
    category: 'portfolio',
    defaultSettings: {
      title: 'Навыки',
      subtitle: '',
      preset: 'tabs',
      size: 'sm',
      show_ranks: true,
    },
    settingsFields: [
      ...titleFields,
      {
        key: 'preset',
        label: 'Визуал',
        type: 'select',
        options: [
          { value: 'tabs', label: 'Вкладки (классика)' },
          { value: 'stacked', label: 'Стек по категориям' },
          { value: 'minimal', label: 'Минимальный список' },
          { value: 'grid', label: 'Сетка карточек' },
        ],
      },
      {
        key: 'size',
        label: 'Размер',
        type: 'select',
        options: [
          { value: 'sm', label: 'Компактный' },
          { value: 'md', label: 'Обычный' },
          { value: 'lg', label: 'Крупный' },
        ],
      },
      { key: 'show_ranks', label: 'Показывать ранги', type: 'toggle' },
    ],
    Render: SkillsWidget,
  })

  registerWidget({
    type: 'experience',
    label: 'Опыт',
    category: 'portfolio',
    defaultSettings: { title: 'Опыт', subtitle: '' },
    settingsFields: titleFields,
    Render: ExperienceWidget,
  })

  registerWidget({
    type: 'services',
    label: 'Услуги',
    category: 'portfolio',
    defaultSettings: { title: 'Услуги', subtitle: '' },
    settingsFields: titleFields,
    Render: ServicesWidget,
  })

  registerWidget({
    type: 'testimonials',
    label: 'Отзывы',
    category: 'portfolio',
    defaultSettings: { title: 'Отзывы', subtitle: '' },
    settingsFields: titleFields,
    Render: TestimonialsWidget,
  })

  registerWidget({
    type: 'blog-list',
    label: 'Список постов',
    category: 'portfolio',
    defaultSettings: { title: 'Блог', subtitle: '', limit: 3 },
    settingsFields: [...titleFields, { key: 'limit', label: 'Лимит', type: 'number' }],
    Render: BlogListWidget,
  })

  registerWidget({
    type: 'contact-form',
    label: 'Форма контакта',
    category: 'portfolio',
    plugin: 'mail',
    defaultSettings: { title: 'Связаться', subtitle: '' },
    settingsFields: titleFields,
    Render: ContactFormWidget,
  })

  registerWidget({
    type: 'profile-card',
    label: 'Обо мне (кратко)',
    category: 'portfolio',
    defaultSettings: {
      title: 'Обо мне',
      subtitle: '',
      cta_label: 'Подробнее',
      cta_href: '/about',
    },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Текст', type: 'textarea' },
      { key: 'cta_label', label: 'Кнопка', type: 'text' },
      { key: 'cta_href', label: 'Ссылка', type: 'url' },
    ),
    Render: ProfileCardWidget,
  })

  registerWidget({
    type: 'cta-banner',
    label: 'CTA-баннер',
    category: 'portfolio',
    defaultSettings: { title: 'Готовы начать?', subtitle: '', cta_label: 'Написать', cta_href: '/contact' },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'cta_label', label: 'Кнопка', type: 'text' },
      { key: 'cta_href', label: 'Ссылка', type: 'url' },
    ),
    Render: CtaBannerWidget,
  })
}
