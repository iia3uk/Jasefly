/**
 * Universal journey / path timeline — reusable across pages (about, careers, product story…).
 * Supports compact / default / featured emphasis, nested milestones, detail lists/grids, tags.
 * Optional autofill_from_projects: details + tags from portfolio (excludes cancelled).
 */
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { ItemsEditor } from '@/builder/edit/ItemsEditor'
import { SectionHeading } from '@/components/ui'
import { useProjects } from '@/hooks/useApi'
import { ABOUT_JOURNEY } from '@/shared/aboutJourneyContent'
import { activeProjectsFeed } from '@/shared/projectPortfolioFeed'

function fields(...items: SettingsField[]) {
  return items
}

export type JourneyItem = {
  period?: string
  title?: string
  category?: string
  description?: string
  details?: string
  /** list (default) | grid — how details render */
  details_layout?: string
  /** Nested mini-timeline: one line per "YYYY — label" */
  milestones?: string
  tags?: string
  /** default | featured | compact */
  emphasis?: string
  compact?: boolean
  featured?: boolean
  /**
   * When true, details grid + tags are filled from published projects
   * excluding project_status=cancelled (manual details/tags used as fallback).
   */
  autofill_from_projects?: boolean
}

export type JourneyGroup = {
  title?: string
  items?: JourneyItem[]
}

function asItems(value: unknown): JourneyItem[] {
  if (!Array.isArray(value)) return []
  return value.filter((x) => x && typeof x === 'object') as JourneyItem[]
}

function lines(value: unknown): string[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function tags(value: unknown): string[] {
  return String(value || '')
    .split(/[,;·|]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseMilestones(value: unknown): Array<{ period: string; label: string }> {
  return lines(value).map((line) => {
    const sep = line.includes('—') ? '—' : line.includes('|') ? '|' : line.includes(' - ') ? ' - ' : null
    if (!sep) return { period: '', label: line }
    const [period, ...rest] = line.split(sep)
    return { period: period.trim(), label: rest.join(sep).trim() }
  })
}

function resolveEmphasis(item: JourneyItem): 'default' | 'featured' | 'compact' {
  if (item.featured || item.emphasis === 'featured') return 'featured'
  if (item.compact || item.emphasis === 'compact') return 'compact'
  const e = String(item.emphasis || 'default').toLowerCase()
  if (e === 'featured' || e === 'compact') return e
  return 'default'
}

function itemFields() {
  return [
    { key: 'period', label: 'Период', kind: 'text' as const },
    { key: 'title', label: 'Заголовок', kind: 'text' as const },
    { key: 'category', label: 'Категория', kind: 'text' as const },
    { key: 'description', label: 'Описание', kind: 'textarea' as const },
    { key: 'details', label: 'Список деталей (по строке)', kind: 'textarea' as const },
    { key: 'details_layout', label: 'Сетка деталей (grid) или list', kind: 'text' as const },
    { key: 'milestones', label: 'Вложенные этапы (строка: «2021 — Название»)', kind: 'textarea' as const },
    { key: 'tags', label: 'Теги (через запятую)', kind: 'text' as const },
    { key: 'featured', label: 'Расширенная карточка', kind: 'toggle' as const },
    { key: 'compact', label: 'Компактная строка', kind: 'toggle' as const },
    { key: 'autofill_from_projects', label: 'Продукты/стек из проектов (без «Отменён»)', kind: 'toggle' as const },
  ]
}

function blankItem(): JourneyItem {
  return {
    period: '',
    title: '',
    category: '',
    description: '',
    details: '',
    details_layout: 'list',
    milestones: '',
    tags: '',
    featured: false,
    compact: false,
    autofill_from_projects: false,
  }
}

function JourneyItemCard({ item }: { item: JourneyItem }) {
  const mode = resolveEmphasis(item)
  const autofill = Boolean(item.autofill_from_projects)
  const { data: projects, isLoading } = useProjects(false, autofill)
  const feed = autofill ? activeProjectsFeed(projects) : null

  const fallbackDetails = lines(item.details)
  const fallbackTags = tags(item.tags)
  const projectCards = feed?.cards ?? []
  const detailList = autofill && projectCards.length ? [] : fallbackDetails
  const tagList = autofill && (feed?.tags.length ?? 0) > 0 ? feed!.tags : fallbackTags
  const milestones = parseMilestones(item.milestones)
  const detailsGrid = String(item.details_layout || '').toLowerCase() === 'grid' || autofill

  return (
    <li
      className={clsx(
        'relative grid gap-2 border-b border-white/[0.06] md:grid-cols-[7.5rem_1fr] md:gap-10',
        mode === 'compact' ? 'py-4 sm:py-5' : mode === 'featured' ? 'py-7 sm:py-9' : 'py-6 sm:py-8',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'absolute left-0 top-0 hidden h-full w-px md:block',
          mode === 'featured' ? 'bg-[var(--accent)]/35' : 'bg-transparent',
        )}
      />
      <p
        className={clsx(
          'tabular-nums text-[var(--muted)] md:pt-1',
          mode === 'compact' ? 'text-xs sm:text-sm' : 'text-sm',
        )}
      >
        {String(item.period || '—')}
      </p>
      <div className="min-w-0">
        {item.category ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]/90">
            {String(item.category)}
          </p>
        ) : null}
        <h3
          className={clsx(
            'font-heading font-semibold tracking-[-0.03em] text-[var(--text)]',
            item.category ? 'mt-1.5' : '',
            mode === 'compact' ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl',
          )}
        >
          {String(item.title || 'Этап')}
        </h3>
        {item.description ? (
          <p
            className={clsx(
              'mt-2 max-w-3xl leading-7 text-[var(--muted)]',
              mode === 'compact' ? 'text-sm' : 'text-sm sm:text-[0.95rem]',
            )}
          >
            {String(item.description)}
          </p>
        ) : null}

        {milestones.length > 0 ? (
          <ol className="mt-4 space-y-2 border-l border-white/[0.1] pl-4">
            {milestones.map((m) => (
              <li key={`${m.period}-${m.label}`} className="grid gap-0.5 sm:grid-cols-[4.5rem_1fr] sm:gap-3">
                {m.period ? (
                  <span className="text-xs tabular-nums text-[var(--muted)]">{m.period}</span>
                ) : null}
                <span className="text-sm text-[var(--muted)]">{m.label}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {autofill && isLoading ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Загрузка проектов…</p>
        ) : null}

        {autofill && projectCards.length > 0 ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {projectCards.map((card) => (
              <li key={String(card.id)}>
                {card.slug ? (
                  <Link
                    to={`/projects/${card.slug}`}
                    className="block rounded border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm leading-6 text-[var(--muted)] transition hover:border-white/20 hover:text-[var(--text)]"
                  >
                    {card.label}
                  </Link>
                ) : (
                  <span className="block rounded border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm leading-6 text-[var(--muted)]">
                    {card.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {!autofill && detailList.length > 0 ? (
          detailsGrid ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {detailList.map((d) => (
                <li
                  key={d}
                  className="rounded border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm leading-6 text-[var(--muted)]"
                >
                  {d}
                </li>
              ))}
            </ul>
          ) : (
            <ul
              className={clsx(
                'mt-3 max-w-3xl space-y-1.5 text-sm leading-6 text-[var(--muted)]',
                mode === 'featured' && 'sm:columns-2 sm:gap-x-8',
              )}
            >
              {detailList.map((d) => (
                <li key={d} className="break-inside-avoid before:mr-2 before:text-[var(--accent)]/70 before:content-['·']">
                  {d}
                </li>
              ))}
            </ul>
          )
        ) : null}

        {/* Manual details as fallback when autofill enabled but feed empty */}
        {autofill && !isLoading && projectCards.length === 0 && detailList.length > 0 ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {detailList.map((d) => (
              <li
                key={d}
                className="rounded border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm leading-6 text-[var(--muted)]"
              >
                {d}
              </li>
            ))}
          </ul>
        ) : null}

        {tagList.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {tagList.map((t) => (
              <li
                key={t}
                className="rounded border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[11px] leading-5 text-[var(--muted)]"
              >
                {t}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  )
}

export function JourneyTimelineView({
  title,
  subtitle,
  pathTitle,
  growthTitle,
  pathItems,
  growthItems,
  items,
  footer,
}: {
  title?: string
  subtitle?: string
  pathTitle?: string
  growthTitle?: string
  pathItems?: JourneyItem[]
  growthItems?: JourneyItem[]
  /** Flat list (single unnamed group) — preferred when only one group. */
  items?: JourneyItem[]
  footer?: string
}) {
  const groups: Array<{ title?: string; items: JourneyItem[] }> = []
  const flat = asItems(items)
  if (flat.length) {
    groups.push({ items: flat })
  } else {
    const path = asItems(pathItems)
    const growth = asItems(growthItems)
    if (path.length) groups.push({ title: pathTitle || undefined, items: path })
    if (growth.length) groups.push({ title: growthTitle || undefined, items: growth })
  }

  if (!groups.length && !title && !subtitle) {
    return <p className="text-sm text-[var(--muted)]">Добавьте этапы таймлайна в настройках виджета.</p>
  }

  return (
    <div className="journey-timeline w-full">
      {(title || subtitle) ? (
        <SectionHeading title={title || 'Путь'} subtitle={subtitle || undefined} />
      ) : null}

      <div className={clsx('mt-2', groups.length > 1 ? 'space-y-12 sm:space-y-14' : '')}>
        {groups.map((group, gi) => (
          <div key={`g-${gi}`}>
            {group.title ? (
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                {group.title}
              </p>
            ) : null}
            <ol className="relative border-t border-white/[0.08]">
              {group.items.map((item, ii) => (
                <JourneyItemCard key={`i-${gi}-${ii}`} item={item} />
              ))}
            </ol>
          </div>
        ))}
      </div>

      {footer ? (
        <p className="mt-10 max-w-3xl border-t border-white/[0.08] pt-6 text-sm leading-7 text-[var(--muted)]">
          {footer}
        </p>
      ) : null}
    </div>
  )
}

function JourneyTimelineWidget({ settings }: { settings: Record<string, unknown> }) {
  return (
    <JourneyTimelineView
      title={settings.title ? String(settings.title) : undefined}
      subtitle={settings.subtitle ? String(settings.subtitle) : undefined}
      pathTitle={settings.path_title ? String(settings.path_title) : undefined}
      growthTitle={settings.growth_title ? String(settings.growth_title) : undefined}
      pathItems={asItems(settings.path_items)}
      growthItems={asItems(settings.growth_items)}
      footer={settings.footer ? String(settings.footer) : undefined}
    />
  )
}

export function registerJourneyWidgets() {
  registerWidget({
    type: 'journey-timeline',
    label: 'Путь / таймлайн',
    category: 'landing',
    defaultSettings: { ...ABOUT_JOURNEY },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Вводный текст', type: 'textarea' },
      { key: 'path_title', label: 'Заголовок группы 1', type: 'text' },
      {
        key: 'path_items',
        label: 'Группа 1 — этапы',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Этап"
            blank={blankItem}
            fields={itemFields()}
          />
        ),
      },
      { key: 'growth_title', label: 'Заголовок группы 2', type: 'text' },
      {
        key: 'growth_items',
        label: 'Группа 2 — этапы',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Этап"
            blank={blankItem}
            fields={itemFields()}
          />
        ),
      },
      { key: 'footer', label: 'Итоговая фраза', type: 'textarea' },
    ),
    Render: JourneyTimelineWidget,
  })
}
