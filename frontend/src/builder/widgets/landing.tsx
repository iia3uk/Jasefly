import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { MediaImage } from '@/components/ui'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { ItemsEditor } from '@/builder/edit/ItemsEditor'
import { readStyles, stylesToCss } from '@/builder/edit/StyleFields'
import { chooseVideoSource, isGeoRiskyPlatform, resolveVideoUrl } from '@/builder/lib/videoEmbed'
import { mediaUrl } from '@/lib/api'
import { ProjectGallery } from '@/modules/projects/components/ProjectGallery'
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
function FeaturesRender({ settings }: { settings: Record<string, unknown> }) {
  const items = asItems(settings.items)
  const cols = Number(settings.columns || 3)
  const styles = stylesToCss(readStyles(settings))
  return (
    <div style={styles}>
      <SectionTitle title={String(settings.title || 'Возможности')} subtitle={String(settings.subtitle || '')} />
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, cols))}, minmax(0, 1fr))` }}
      >
        {items.length ? items.map((item, i) => (
          <div key={i} className="rounded-[var(--radius)] border border-white/[0.08] bg-white/[0.02] p-5">
            {item.icon ? (
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[var(--accent)]">
                <AppIcon name={String(item.icon)} size={18} />
              </span>
            ) : null}
            <h3 className="font-heading text-lg font-semibold">{String(item.title || 'Фича')}</h3>
            {item.body ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{String(item.body)}</p> : null}
          </div>
        )) : (
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
      {
        key: 'items',
        label: 'Карточки',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Карточка"
            blank={() => ({ icon: '', title: '', body: '' })}
            fields={[
              { key: 'icon', label: 'Иконка (имя)', kind: 'text' },
              { key: 'title', label: 'Заголовок', kind: 'text' },
              { key: 'body', label: 'Текст', kind: 'textarea' },
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
}
