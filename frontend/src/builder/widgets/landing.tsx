import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { MediaImage } from '@/components/ui'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { ItemsEditor } from '@/builder/edit/ItemsEditor'
import { readStyles, stylesToCss } from '@/builder/edit/StyleFields'
import { chooseVideoSource, isGeoRiskyPlatform, resolveVideoUrl } from '@/builder/lib/videoEmbed'
import { mediaUrl } from '@/lib/api'
import { ProjectGallery } from '@/modules/projects/components/ProjectGallery'
import {
  PlAudience,
  PlCompare,
  PlCta,
  PlFeatures,
  PlHero,
  PlHow,
  PlMcp,
  PlModules,
  PlShowcase,
  PlTech,
  PlUpdates,
  ProductLanding,
} from '@/modules/site/productLanding'
import {
  productLandingDefaultsFor,
  PRODUCT_LANDING_DEFAULTS,
  productLandingSettingsFields,
  productLandingSettingsFieldsFor,
  type PlSectionId,
} from '@/modules/site/productLanding/contentDefaults'
import { AppIcon } from '@/shared/icons'
import type { ProjectMediaItem } from '@/types'
import clsx from 'clsx'

function fields(...items: SettingsField[]) {
  return items
}

function asItems(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>> : []
}

function SectionTitle({ title, subtitle }: { title?: string; subtitle?: string }) {
  if (!title && !subtitle) return null
  return (
    <div className="mb-8 max-w-2xl">
      {title ? <h2 className="font-heading text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{title}</h2> : null}
      {subtitle ? <p className="mt-2 text-[var(--muted)]">{subtitle}</p> : null}
    </div>
  )
}

/* ——— Gallery (same UI as project portfolio gallery) ——— */
function GalleryRender({ settings }: { settings: Record<string, unknown> }) {
  const items = asItems(settings.items)
  const styles = stylesToCss(readStyles(settings))
  const slides: ProjectMediaItem[] = items.map((item, i) => ({
    id: i,
    media_id: (item.media_id as ProjectMediaItem['media_id']) ?? null,
    media_mime: (item.media_mime as string | null | undefined) ?? null,
    mime_type: (item.media_mime as string | null | undefined) ?? null,
    url: String(item.url || '') || null,
    caption: String(item.caption || '') || null,
    original_name: (item.original_name as string | null | undefined) ?? null,
    filename: (item.filename as string | null | undefined) ?? null,
  }))
  const title = String(settings.title || 'Галерея')
  const subtitle = String(settings.subtitle || '')

  return (
    <div style={styles}>
      {subtitle ? (
        <div className="mb-2 max-w-2xl">
          <p className="text-[var(--muted)]">{subtitle}</p>
        </div>
      ) : null}
      {!slides.length ? (
        <div className="rounded-[var(--radius)] border border-dashed border-white/15 px-4 py-10 text-center text-sm text-[var(--muted)]">
          Добавьте фото или видео в галерею
        </div>
      ) : (
        <ProjectGallery items={slides} title={title} className="!mt-0" />
      )}
    </div>
  )
}

/* ——— FAQ ——— */
function FaqRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const items = asItems(settings.items)
  const [open, setOpen] = useState<number | null>(editMode ? 0 : null)
  const styles = stylesToCss(readStyles(settings))
  return (
    <div style={styles}>
      <SectionTitle title={String(settings.title || 'FAQ')} subtitle={String(settings.subtitle || '')} />
      <div className="divide-y divide-white/[0.08] border-t border-white/[0.08]">
        {items.length ? items.map((item, i) => {
          const isOpen = open === i
          return (
            <div key={i}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 py-4 text-left"
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span className="font-medium">{String(item.q || 'Вопрос')}</span>
                <ChevronDown size={16} className={clsx('shrink-0 text-[var(--muted)] transition', isOpen && 'rotate-180')} />
              </button>
              {isOpen ? (
                <p className="pb-4 text-sm leading-6 text-[var(--muted)]">{String(item.a || '')}</p>
              ) : null}
            </div>
          )
        }) : (
          <p className="py-6 text-sm text-[var(--muted)]">Добавьте вопросы</p>
        )}
      </div>
    </div>
  )
}

/* ——— Logos ——— */
function LogosRender({ settings }: { settings: Record<string, unknown> }) {
  const items = asItems(settings.items)
  const styles = stylesToCss(readStyles(settings))
  return (
    <div style={styles}>
      <SectionTitle title={String(settings.title || '')} subtitle={String(settings.subtitle || '')} />
      <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
        {items.length ? items.map((item, i) => {
          const body = item.media_id ? (
            <MediaImage media={item.media_id as never} alt={String(item.label || '')} className="h-10 w-auto max-w-[8rem] object-contain opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0 sm:h-12" />
          ) : (
            <span className="text-sm text-[var(--muted)]">{String(item.label || 'Лого')}</span>
          )
          return item.href ? (
            <a key={i} href={String(item.href)} target="_blank" rel="noreferrer" className="inline-flex">
              {body}
            </a>
          ) : (
            <div key={i}>{body}</div>
          )
        }) : (
          <p className="text-sm text-[var(--muted)]">Добавьте логотипы клиентов</p>
        )}
      </div>
    </div>
  )
}

/* ——— Pricing ——— */
function PricingRender({ settings }: { settings: Record<string, unknown> }) {
  const plans = asItems(settings.plans)
  const styles = stylesToCss(readStyles(settings))
  return (
    <div style={styles}>
      <SectionTitle title={String(settings.title || 'Тарифы')} subtitle={String(settings.subtitle || '')} />
      <div className="grid gap-4 md:grid-cols-3">
        {plans.length ? plans.map((plan, i) => {
          const features = String(plan.features || '')
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean)
          const hi = Boolean(plan.highlighted)
          return (
            <div
              key={i}
              className={clsx(
                'flex flex-col rounded-[calc(var(--radius)+4px)] border p-5 sm:p-6',
                hi ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10' : 'border-white/[0.08] bg-white/[0.02]',
              )}
            >
              <h3 className="font-heading text-lg font-semibold">{String(plan.name || 'План')}</h3>
              <p className="mt-3 font-heading text-3xl font-semibold tracking-tight">
                {String(plan.price || '—')}
                {plan.period ? <span className="ml-1 text-sm font-normal text-[var(--muted)]">{String(plan.period)}</span> : null}
              </p>
              {features.length ? (
                <ul className="mt-4 flex-1 space-y-2 text-sm text-[var(--muted)]">
                  {features.map((f) => <li key={f}>· {f}</li>)}
                </ul>
              ) : null}
              {plan.cta_label ? (
                <a
                  href={String(plan.cta_href || '#')}
                  className={clsx('button mt-6 w-full', hi ? 'admin-primary' : 'button-ghost')}
                >
                  {String(plan.cta_label)}
                </a>
              ) : null}
            </div>
          )
        }) : (
          <p className="text-sm text-[var(--muted)] md:col-span-3">Добавьте тарифные планы</p>
        )}
      </div>
    </div>
  )
}

/* ——— Features ——— */
function featuresGridClass(cols: number): string {
  const n = Math.min(4, Math.max(1, cols))
  if (n <= 1) return 'grid-cols-1'
  if (n === 2) return 'grid-cols-1 sm:grid-cols-2'
  // 3–4 cols: single column on phones so titles/body don't crush
  if (n === 3) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
}

function FeatureCardLink({
  href,
  className,
  children,
}: {
  href: string
  className: string
  children: ReactNode
}) {
  const external = href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  )
}

function FeaturesRender({ settings }: { settings: Record<string, unknown> }) {
  const items = asItems(settings.items)
  const cols = Number(settings.columns || 3)
  const styles = stylesToCss(readStyles(settings))
  const accented = settings.accented === true || settings.accented === 1 || settings.accented === '1'
  return (
    <div className="min-w-0" style={styles}>
      <SectionTitle title={String(settings.title || 'Возможности')} subtitle={String(settings.subtitle || '')} />
      <div className={clsx('grid gap-4 sm:gap-5', accented && 'fw-features-accent', featuresGridClass(cols))}>
        {items.length ? items.map((item, i) => {
          const href = String(item.href || '').trim()
          const cta = String(item.cta || item.cta_label || (href ? 'Open live →' : ''))
          const className = clsx(
            'fw-feature-card relative min-w-0 overflow-hidden rounded-[var(--radius)] border border-white/[0.08] bg-white/[0.02] p-4 transition duration-300 sm:p-6',
            accented && `fw-feature-tone-${(i % 6) + 1}`,
            href && 'hover:-translate-y-0.5 hover:border-[color:var(--primary)]/35 hover:shadow-[0_16px_40px_-28px_var(--primary)]',
          )
          const body = (
            <>
              {accented ? <span className="fw-feature-bar" aria-hidden /> : null}
              {item.icon ? (
                <span className="fw-feature-icon mb-3 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] sm:mb-4 sm:h-11 sm:w-11">
                  <AppIcon name={String(item.icon)} size={18} />
                </span>
              ) : null}
              <h3 className="break-words font-heading text-base font-semibold sm:text-lg">{String(item.title || 'Фича')}</h3>
              {item.body ? (
                <p className="mt-2 break-words text-sm leading-6 text-[var(--muted)]">{String(item.body)}</p>
              ) : null}
              {cta ? (
                <p className={clsx('mt-3 text-sm font-medium', href ? 'text-[color:var(--primary)]' : 'text-[color:var(--muted)]')}>
                  {cta}
                </p>
              ) : null}
            </>
          )
          return href ? (
            <FeatureCardLink key={i} href={href} className={className}>
              {body}
            </FeatureCardLink>
          ) : (
            <div key={i} className={className}>
              {body}
            </div>
          )
        }) : (
          <p className="text-sm text-[var(--muted)]">Добавьте карточки возможностей</p>
        )}
      </div>
    </div>
  )
}

/* ——— Video ——— */
function VideoRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const styles = stylesToCss(readStyles(settings))
  const fileSrc = mediaUrl(settings.media_id as never)
  const choice = useMemo(
    () =>
      chooseVideoSource({
        mediaUrl: fileSrc,
        url: String(settings.url || ''),
        fallbackUrl: String(settings.fallback_url || ''),
        preferNonYoutube: settings.prefer_non_youtube !== false,
      }),
    [fileSrc, settings.url, settings.fallback_url, settings.prefer_non_youtube],
  )
  const primaryMeta = useMemo(() => resolveVideoUrl(String(settings.url || '')), [settings.url])
  const { resolved, usedFallback, youtubeSkipped } = choice

  return (
    <div style={styles}>
      <SectionTitle title={String(settings.title || '')} subtitle={String(settings.subtitle || '')} />
      {resolved.kind === 'iframe' ? (
        <div className="overflow-hidden rounded-[var(--radius)] bg-black/40" style={{ position: 'relative', width: '100%', height: 0, paddingTop: '56.25%' }}>
          <iframe
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', maxHeight: 'none', border: 0 }}
            src={resolved.src}
            title={String(settings.title || 'video')}
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : resolved.kind === 'file' ? (
        <video
          className="aspect-video w-full rounded-[var(--radius)] bg-black/40"
          src={resolved.src}
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-[var(--radius)] border border-dashed border-white/15 px-4 text-center text-sm text-[var(--muted)]">
          Загрузите файл в медиа или вставьте ссылку (Rutube, VK, Vimeo, YouTube, MP4, любой embed URL)
        </div>
      )}
      {editMode && (youtubeSkipped || (primaryMeta.kind === 'iframe' && isGeoRiskyPlatform(primaryMeta.platform))) ? (
        <p className="mt-2 text-[11px] leading-4 text-amber-200/90">
          {youtubeSkipped
            ? 'YouTube пропущен: играет запасной источник (в РФ YouTube часто недоступен без VPN).'
            : 'YouTube может не открываться без VPN. Лучше: файл в медиа-библиотеке или Rutube/VK + YouTube как запасной.'}
          {usedFallback ? ' Сейчас показан fallback.' : ''}
        </p>
      ) : null}
    </div>
  )
}

export function registerLandingWidgets() {
  registerWidget({
    type: 'image-gallery',
    label: 'Галерея',
    category: 'landing',
    defaultSettings: {
      title: 'Галерея',
      subtitle: '',
      items: [],
    },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      {
        key: 'items',
        label: 'Медиа (фото / видео)',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            blank={() => ({ media_id: null, media_mime: null, url: '', caption: '' })}
            addActions={[
              { label: 'Изображение', blank: () => ({ media_id: null, media_mime: null, url: '', caption: '' }) },
              { label: 'Видео', blank: () => ({ media_id: null, media_mime: 'video/mp4', url: '', caption: '' }) },
            ]}
            fields={[
              { key: 'media_id', label: 'Файл (фото или видео MP4/WebM)', kind: 'media' },
              { key: 'url', label: 'Или ссылка на видео (YouTube / Rutube / VK / Vimeo / MP4)', kind: 'url' },
              { key: 'caption', label: 'Подпись', kind: 'text' },
            ]}
          />
        ),
      },
    ),
    Render: GalleryRender,
  })

  registerWidget({
    type: 'faq',
    label: 'FAQ / Аккордеон',
    category: 'landing',
    defaultSettings: {
      title: 'Частые вопросы',
      subtitle: '',
      items: [
        { q: 'Как это работает?', a: 'Краткий ответ…' },
        { q: 'Сколько стоит?', a: 'Зависит от задачи.' },
      ],
    },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      {
        key: 'items',
        label: 'Вопросы',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Вопрос"
            blank={() => ({ q: '', a: '' })}
            fields={[
              { key: 'q', label: 'Вопрос', kind: 'text' },
              { key: 'a', label: 'Ответ', kind: 'textarea' },
            ]}
          />
        ),
      },
    ),
    Render: FaqRender,
  })

  registerWidget({
    type: 'logos-strip',
    label: 'Логотипы / клиенты',
    category: 'landing',
    defaultSettings: { title: 'Нам доверяют', subtitle: '', items: [] },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      {
        key: 'items',
        label: 'Логотипы',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Логотип"
            blank={() => ({ media_id: null, label: '', href: '' })}
            fields={[
              { key: 'media_id', label: 'Лого', kind: 'media' },
              { key: 'label', label: 'Название', kind: 'text' },
              { key: 'href', label: 'Ссылка', kind: 'url' },
            ]}
          />
        ),
      },
    ),
    Render: LogosRender,
  })

  registerWidget({
    type: 'pricing-table',
    label: 'Тарифы',
    category: 'landing',
    defaultSettings: {
      title: 'Тарифы',
      subtitle: '',
      plans: [
        { name: 'Старт', price: '0 ₽', period: '/мес', features: 'Базовые функции\nEmail-поддержка', cta_label: 'Начать', cta_href: '/contact', highlighted: false },
        { name: 'Про', price: '4 900 ₽', period: '/мес', features: 'Всё из Старта\nПриоритет\nКастом', cta_label: 'Выбрать', cta_href: '/contact', highlighted: true },
      ],
    },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      {
        key: 'plans',
        label: 'Планы',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="План"
            blank={() => ({ name: '', price: '', period: '', features: '', cta_label: '', cta_href: '', highlighted: false })}
            fields={[
              { key: 'name', label: 'Название', kind: 'text' },
              { key: 'price', label: 'Цена', kind: 'text' },
              { key: 'period', label: 'Период', kind: 'text' },
              { key: 'features', label: 'Фичи (по строке)', kind: 'textarea' },
              { key: 'cta_label', label: 'Кнопка', kind: 'text' },
              { key: 'cta_href', label: 'Ссылка', kind: 'url' },
              { key: 'highlighted', label: 'Выделить', kind: 'toggle' },
            ]}
          />
        ),
      },
    ),
    Render: PricingRender,
  })

  registerWidget({
    type: 'features-grid',
    label: 'Сетка фич',
    category: 'landing',
    defaultSettings: {
      title: 'Возможности',
      subtitle: '',
      columns: 3,
      accented: false,
      items: [
        { icon: 'sparkles', title: 'Быстро', body: 'Запуск без лишней сложности.' },
        { icon: 'shield', title: 'Надёжно', body: 'Стабильная база и бэкапы.' },
        { icon: 'zap', title: 'Гибко', body: 'Собирайте страницу из блоков.' },
      ],
    },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'columns', label: 'Колонки', type: 'number' },
      { key: 'accented', label: 'Цветные акценты карточек', type: 'toggle' },
      {
        key: 'items',
        label: 'Карточки',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Карточка"
            blank={() => ({ icon: '', title: '', body: '', href: '', cta: '' })}
            fields={[
              { key: 'icon', label: 'Иконка (имя)', kind: 'text' },
              { key: 'title', label: 'Заголовок', kind: 'text' },
              { key: 'body', label: 'Текст', kind: 'textarea' },
              { key: 'href', label: 'Ссылка (live)', kind: 'url' },
              { key: 'cta', label: 'CTA (напр. Open live →)', kind: 'text' },
            ]}
          />
        ),
      },
    ),
    Render: FeaturesRender,
  })

  registerWidget({
    type: 'video-embed',
    label: 'Видео',
    category: 'landing',
    defaultSettings: {
      title: '',
      subtitle: '',
      media_id: null,
      url: '',
      fallback_url: '',
      prefer_non_youtube: true,
    },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'media_id', label: 'Файл с сайта (MP4/WebM) — работает везде, без VPN', type: 'media' },
      { key: 'url', label: 'Ссылка или embed (Rutube / VK / Vimeo / YouTube / любой iframe URL)', type: 'url' },
      { key: 'fallback_url', label: 'Запасная ссылка (если основная — YouTube)', type: 'url' },
      { key: 'prefer_non_youtube', label: 'Не ставить YouTube первым, если есть файл/fallback', type: 'toggle' },
    ),
    Render: VideoRender,
  })

  registerWidget({
    type: 'product-landing',
    label: 'Шаблон · Product Landing весь (устар.)',
    category: 'landing',
    defaultSettings: { ...PRODUCT_LANDING_DEFAULTS },
    settingsFields: productLandingSettingsFields(),
    Render: ({ settings, editMode }) => <ProductLanding settings={settings} editMode={editMode} />,
  })

  const plBlocks: Array<{
    type: string
    label: string
    section: PlSectionId
    Render: typeof PlHero
  }> = [
    { type: 'pl-hero', label: 'Шаблон · Hero (устар.)', section: 'hero', Render: PlHero },
    { type: 'pl-how', label: 'Шаблон · Как работает (устар.)', section: 'how', Render: PlHow },
    { type: 'pl-compare', label: 'Шаблон · Сравнение VPS (устар.)', section: 'compare', Render: PlCompare },
    { type: 'pl-showcase', label: 'Шаблон · Showcase (устар.)', section: 'showcase', Render: PlShowcase },
    { type: 'pl-features', label: 'Шаблон · Возможности (устар.)', section: 'features', Render: PlFeatures },
    { type: 'pl-mcp', label: 'Шаблон · MCP (устар.)', section: 'mcp', Render: PlMcp },
    { type: 'pl-updates', label: 'Шаблон · Обновления (устар.)', section: 'updates', Render: PlUpdates },
    { type: 'pl-modules', label: 'Шаблон · Модули (устар.)', section: 'modules', Render: PlModules },
    { type: 'pl-audience', label: 'Шаблон · Аудитория (устар.)', section: 'audience', Render: PlAudience },
    { type: 'pl-tech', label: 'Шаблон · Стек (устар.)', section: 'tech', Render: PlTech },
    { type: 'pl-cta', label: 'Шаблон · CTA (устар.)', section: 'cta', Render: PlCta },
  ]

  for (const block of plBlocks) {
    const Comp = block.Render
    registerWidget({
      type: block.type,
      label: block.label,
      category: 'landing',
      defaultSettings: productLandingDefaultsFor(block.section),
      settingsFields: productLandingSettingsFieldsFor(block.section),
      Render: ({ settings, editMode }) => <Comp settings={settings} editMode={editMode} />,
    })
  }
}
