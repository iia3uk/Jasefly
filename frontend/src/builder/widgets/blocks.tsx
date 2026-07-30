/**
 * Universal Framer-style building blocks for the Page Builder.
 * Reusable on any page — not tied to the official marketing home.
 */
import clsx from 'clsx'
import { Children, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react'
import { Link } from 'react-router-dom'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { EditableText } from '@/builder/edit/Editable'
import { ItemsEditor } from '@/builder/edit/ItemsEditor'
import { useBuilderEdit } from '@/builder/context/BuilderEditContext'
import { readFieldStyles, readStyles, stylesToCss } from '@/builder/edit/StyleFields'
import { mediaUrl } from '@/lib/api'
import { AppIcon } from '@/shared/icons'
import { isVideoFileUrl } from '@/builder/lib/videoEmbed'

function fields(...items: SettingsField[]) {
  return items
}

type Row = Record<string, unknown>

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return []
  return value.filter((x) => x && typeof x === 'object') as Row[]
}

const chipClass =
  'inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-[color:var(--muted)]'
const ctaPrimary =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius)] bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-[color:var(--background)] transition-opacity hover:opacity-90 sm:w-auto'
const ctaGhost =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius)] border border-white/15 px-5 py-3 text-sm font-semibold text-[color:var(--text)] transition-colors hover:bg-white/5 sm:w-auto'

function mediaAspect(ratio?: string) {
  if (ratio === 'square' || ratio === '1/1') return '1'
  if (ratio === '4/3') return '4/3'
  if (ratio === '4/5') return '4/5'
  if (ratio === 'auto' || ratio === 'none') return undefined
  return '16/9'
}

/** Высота hero на фоне: шаблоны; основной = весь доступный экран под шапкой. */
export const HERO_HEIGHT_PRESETS = {
  viewport: {
    label: 'На весь экран',
    minHeight: 'var(--cms-hero-vh, var(--cms-snap-vh, calc(100dvh - var(--admin-bar-h, 0px))))',
    bleedY: '0px',
    /** В превью билдера vh = окно браузера, не рамка устройства. */
    editMinHeight: 'min(36rem, 92cqi)',
  },
  tall: {
    label: 'Высокий',
    minHeight: 'min(100dvh, 56rem)',
    bleedY: '3rem',
    editMinHeight: 'min(28rem, 85cqi)',
  },
  compact: {
    label: 'Компактный',
    minHeight: 'min(72vh, 36rem)',
    bleedY: '2rem',
    editMinHeight: 'min(22rem, 70cqi)',
  },
} as const

function resolveHeroHeight(settings: Record<string, unknown>, editMode?: boolean): { minH: string; bleedY: string } {
  const hasPreset = Object.prototype.hasOwnProperty.call(settings, 'height_preset')
  const hasLegacyMin = Object.prototype.hasOwnProperty.call(settings, 'media_min_height')
  // Legacy без height_preset сохраняет media_min_height; новый дефолт = viewport.
  const presetRaw = hasPreset
    ? String(settings.height_preset || 'viewport')
    : hasLegacyMin
      ? 'custom'
      : 'viewport'

  if (presetRaw === 'custom') {
    const minH = String(settings.media_min_height || HERO_HEIGHT_PRESETS.viewport.minHeight)
    const bleedY = editMode ? '0px' : String(settings.media_bleed_y || '0px')
    if (editMode && /(d?vh|dvw)/i.test(minH)) {
      return { minH: HERO_HEIGHT_PRESETS.viewport.editMinHeight, bleedY }
    }
    return { minH, bleedY }
  }

  const key = (presetRaw in HERO_HEIGHT_PRESETS
    ? presetRaw
    : 'viewport') as keyof typeof HERO_HEIGHT_PRESETS
  const conf = HERO_HEIGHT_PRESETS[key]
  return {
    minH: editMode ? conf.editMinHeight : conf.minHeight,
    bleedY: editMode ? '0px' : conf.bleedY,
  }
}

/** Full-bleed media behind hero content — always cover-zooms to the content box. */
function HeroBackgroundFill({
  mediaId,
  url,
  alt,
  editMode,
  objectPosition,
}: {
  mediaId?: unknown
  url?: string
  alt?: string
  editMode?: boolean
  objectPosition?: string
}) {
  const ctx = useBuilderEdit()
  const src = mediaUrl(mediaId as never) || String(url || '').trim()
  const pos = String(objectPosition || 'center center')
  const selected = Boolean(
    editMode && ctx && ctx.selectedId === ctx.elementId && ctx.selectedPart === 'media_id',
  )

  const selectMedia = (e: SyntheticEvent) => {
    if (!editMode || !ctx) return
    e.preventDefault()
    e.stopPropagation()
    ctx.onSelectElement(ctx.elementId, { part: 'media_id' })
  }

  const mediaStyle: CSSProperties = {
    objectFit: 'cover',
    objectPosition: pos,
    width: '100%',
    height: '100%',
    minWidth: '100%',
    minHeight: '100%',
  }

  const media = !src ? (
    <div className="flex h-full w-full items-center justify-center bg-white/[0.03] text-sm text-[color:var(--muted)]">
      {editMode ? 'Выберите фото или видео для фона' : null}
    </div>
  ) : isVideoFileUrl(src) ? (
    <video
      src={src}
      autoPlay
      muted
      loop
      playsInline
      className="pointer-events-none h-full w-full"
      style={mediaStyle}
      aria-label={alt || undefined}
    />
  ) : (
    <img
      src={src}
      alt={alt || ''}
      className="pointer-events-none h-full w-full"
      style={mediaStyle}
    />
  )

  if (!editMode) {
    return (
      <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden>
        {media}
      </div>
    )
  }

  return (
    <div
      data-builder-editable
      data-field="media_id"
      role="button"
      tabIndex={0}
      title="Фон — клик чтобы сменить медиа"
      onMouseDown={selectMedia}
      onClick={selectMedia}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') selectMedia(e)
      }}
      className={clsx(
        'absolute inset-0 z-0 overflow-hidden outline-none',
        selected
          ? 'ring-2 ring-[var(--accent,#8eb6ff)] ring-inset'
          : 'hover:ring-1 hover:ring-inset hover:ring-white/30',
      )}
    >
      {media}
      <span
        className={clsx(
          'pointer-events-none absolute right-3 top-3 z-10 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          selected
            ? 'bg-[var(--accent,#8eb6ff)] text-black'
            : 'bg-black/55 text-zinc-200 ring-1 ring-white/15',
        )}
      >
        Фон
      </span>
    </div>
  )
}

/** Side media (or non-fill); sizes from settings + fieldStyles.media_id. */
function MediaBox({
  mediaId,
  url,
  alt,
  ratio,
  placeholder,
  editMode,
  settings,
  fieldKey = 'media_id',
  fill = false,
  width,
  height,
  objectFit,
  className,
}: {
  mediaId?: unknown
  url?: string
  alt?: string
  ratio?: string
  placeholder?: string
  editMode?: boolean
  settings?: Record<string, unknown>
  fieldKey?: string
  fill?: boolean
  width?: string
  height?: string
  objectFit?: string
  className?: string
}) {
  const ctx = useBuilderEdit()
  const src = mediaUrl(mediaId as never) || String(url || '').trim()
  const fieldCss = settings ? stylesToCss(readFieldStyles(settings, fieldKey)) : {}
  const fit = String(objectFit || fieldCss.objectFit || 'cover')
  const merged: CSSProperties = {
    ...fieldCss,
    ...(width ? { width } : null),
    ...(height ? { height } : null),
    objectFit: (fit || 'cover') as CSSProperties['objectFit'],
  }
  const hasBoxSize = Boolean(merged.width || merged.height || merged.maxWidth)
  const aspect = fill || merged.height ? undefined : mediaAspect(ratio)
  if (aspect && !merged.aspectRatio) merged.aspectRatio = aspect

  const selected = Boolean(
    editMode && ctx && ctx.selectedId === ctx.elementId && ctx.selectedPart === fieldKey,
  )

  const selectMedia = (e: SyntheticEvent) => {
    if (!editMode || !ctx) return
    e.preventDefault()
    e.stopPropagation()
    ctx.onSelectElement(ctx.elementId, { part: fieldKey })
  }

  const body = !src ? (
    <div
      className={clsx(
        'flex items-center justify-center border border-dashed border-white/15 bg-white/[0.02] text-center text-sm text-[color:var(--muted)]',
        fill ? 'absolute inset-0' : 'w-full rounded-[var(--radius)]',
        className,
      )}
      style={fill ? undefined : merged}
    >
      <div className="px-4 py-8">
        <p className="font-medium text-[color:var(--text)]">{placeholder || 'Изображение'}</p>
        {editMode ? <p className="mt-1 text-xs">Медиа / URL в инспекторе · клик — размеры</p> : null}
      </div>
    </div>
  ) : isVideoFileUrl(src) ? (
    <video
      src={src}
      autoPlay
      muted
      loop
      playsInline
      className={clsx(
        fill
          ? 'pointer-events-none absolute inset-0 h-full w-full'
          : clsx('rounded-[var(--radius)]', !hasBoxSize && 'w-full'),
        className,
      )}
      style={fill
        ? { objectFit: (fit || 'cover') as CSSProperties['objectFit'], objectPosition: String(merged.objectPosition || 'center') }
        : merged}
      aria-label={alt || undefined}
    />
  ) : (
    <img
      src={src}
      alt={alt || ''}
      className={clsx(
        fill
          ? 'pointer-events-none absolute inset-0 h-full w-full'
          : clsx('rounded-[var(--radius)]', !hasBoxSize && 'w-full'),
        className,
      )}
      style={fill
        ? { objectFit: (fit || 'cover') as CSSProperties['objectFit'], objectPosition: String(merged.objectPosition || 'center') }
        : merged}
    />
  )

  if (!editMode) {
    return fill ? <>{body}</> : <div className={clsx(!hasBoxSize && 'w-full')}>{body}</div>
  }

  return (
    <div
      data-builder-editable
      data-field={fieldKey}
      role="button"
      tabIndex={0}
      title="Медиа — клик для размера / object-fit"
      onMouseDown={selectMedia}
      onClick={selectMedia}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') selectMedia(e)
      }}
      className={clsx(
        'relative outline-none transition',
        fill ? 'absolute inset-0' : 'block w-full',
        selected
          ? 'ring-2 ring-[var(--accent,#8eb6ff)] ring-offset-2 ring-offset-[var(--background,#0a0a0b)]'
          : 'hover:ring-1 hover:ring-white/35',
      )}
    >
      {body}
      <span
        className={clsx(
          'pointer-events-none absolute z-10 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          fill ? 'right-3 top-3' : 'left-2 top-2',
          selected
            ? 'bg-[var(--accent,#8eb6ff)] text-black'
            : 'bg-black/55 text-zinc-200 ring-1 ring-white/15',
        )}
      >
        {fill ? 'Фон' : 'Медиа'}
      </span>
    </div>
  )
}

function Cta({
  label,
  href,
  variant,
  editMode,
  field,
}: {
  label: string
  href: string
  variant: 'solid' | 'ghost'
  editMode?: boolean
  field: string
}) {
  const className = variant === 'ghost' ? ctaGhost : ctaPrimary
  if (editMode) {
    return (
      <EditableText field={field} label="Кнопка" value={label} as="span" className={className} placeholder="Кнопка" />
    )
  }
  if (!label) return null
  const external = href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')
  if (external) return <a href={href || '#'} className={className}>{label}</a>
  return <Link to={href || '#'} className={className}>{label}</Link>
}

function MediaPlaceholderRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const styles = stylesToCss(readStyles(settings))
  return (
    <div style={styles}>
      <MediaBox
        mediaId={settings.media_id}
        url={String(settings.url || '')}
        alt={String(settings.alt || '')}
        ratio={String(settings.ratio || '16/9')}
        placeholder={String(settings.placeholder || 'Placeholder')}
        editMode={editMode}
        settings={settings}
        width={settings.media_width ? String(settings.media_width) : undefined}
        height={settings.media_height ? String(settings.media_height) : undefined}
        objectFit={settings.media_object_fit ? String(settings.media_object_fit) : undefined}
      />
      {(settings.caption || editMode) ? (
        <EditableText
          field="caption"
          label="Подпись"
          value={String(settings.caption || '')}
          as="p"
          className="mt-2 text-center text-xs text-[color:var(--muted)]"
          placeholder="Подпись"
        />
      ) : null}
    </div>
  )
}

function HeroBlockRender({
  settings,
  editMode,
  children,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
  children?: ReactNode
}) {
  const styles = stylesToCss(readStyles(settings))
  const layout = String(settings.layout || 'split')
  const mediaMode = String(settings.media_mode || 'background')
  const chips = asRows(settings.chips)
  const reverse = settings.image_position === 'left'
  const align = String(settings.align || 'left')
  const overlayRaw = settings.media_overlay
  const overlay = overlayRaw === '' || overlayRaw == null
    ? 0.35
    : Number(overlayRaw)
  const overlaySafe = Number.isFinite(overlay) ? Math.min(1, Math.max(0, overlay)) : 0.35
  // В билдере чуть светлее — чтобы фон был виден при правках
  const overlayStrength = editMode ? Math.min(overlaySafe, 0.28) * 0.55 : overlaySafe
  const { minH, bleedY } = resolveHeroHeight(settings, editMode)
  const nestedKids = Children.toArray(children)
  const hasNested = nestedKids.length > 0
  const showBuiltIn = editMode || Boolean(
    settings.badge
    || settings.title_1
    || settings.title_2
    || settings.body
    || settings.cta1_label
    || settings.cta2_label
    || chips.length,
  )

  const copy = (
    <div className={clsx(align === 'center' && 'text-center mx-auto')}>
      {(settings.badge || editMode) ? (
        <EditableText
          field="badge"
          label="Бейдж"
          value={String(settings.badge || '')}
          as="p"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]"
          placeholder="Бейдж"
        />
      ) : null}
      <h1 className="mt-5 break-words font-[family-name:var(--font-heading)] text-[clamp(1.85rem,7vw,3.75rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-[color:var(--text)] sm:text-5xl lg:text-6xl">
        <EditableText field="title_1" label="Заголовок 1" value={String(settings.title_1 || '')} as="span" className="block" placeholder="Заголовок" />
        {(settings.title_2 || editMode) ? (
          <EditableText
            field="title_2"
            label="Заголовок 2"
            value={String(settings.title_2 || '')}
            as="span"
            className="mt-2 block text-[color:var(--accent)]"
            placeholder="Вторая строка"
          />
        ) : null}
      </h1>
      {(settings.body || editMode) ? (
        <EditableText
          field="body"
          label="Текст"
          value={String(settings.body || '')}
          as="p"
          multiline
          className="mt-6 max-w-2xl text-base leading-7 text-[color:var(--muted)] md:text-lg"
          placeholder="Описание"
        />
      ) : null}
      <div className={clsx('mt-8 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap', align === 'center' && 'sm:justify-center')}>
        <Cta label={String(settings.cta1_label || '')} href={String(settings.cta1_href || '#')} variant="solid" editMode={editMode} field="cta1_label" />
        <Cta label={String(settings.cta2_label || '')} href={String(settings.cta2_href || '#')} variant="ghost" editMode={editMode} field="cta2_label" />
      </div>
      {chips.length || editMode ? (
        <div className={clsx('mt-8 flex flex-wrap gap-2', align === 'center' && 'justify-center')}>
          {(chips.length ? chips : [{ label: 'Чип' }]).map((chip, i) => (
            <span key={i} className={chipClass}>{String(chip.label || chip.text || '')}</span>
          ))}
        </div>
      ) : null}
    </div>
  )

  const mediaProps = {
    mediaId: settings.media_id,
    url: String(settings.media_url || ''),
    alt: String(settings.media_alt || ''),
    ratio: String(settings.media_ratio || '4/3'),
    placeholder: String(settings.media_placeholder || 'Hero image'),
    editMode,
    settings,
    width: settings.media_width ? String(settings.media_width) : undefined,
    height: settings.media_height ? String(settings.media_height) : undefined,
    objectFit: settings.media_object_fit ? String(settings.media_object_fit) : undefined,
  }

  const inner = (
    <div className={clsx('w-full space-y-6', align === 'center' && 'flex flex-col items-center')}>
      {showBuiltIn ? copy : null}
      {hasNested ? <div className="w-full space-y-4">{nestedKids}</div> : null}
      {editMode && !hasNested ? (
        <p className="rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-6 text-center text-xs text-zinc-400">
          Карточка-контейнер: перетащите сюда heading / text / button — или правьте поля слева
        </p>
      ) : null}
    </div>
  )

  if (mediaMode === 'background') {
    return (
      <div
        style={{
          ...styles,
          minHeight: minH,
          marginTop: bleedY === '0px' || bleedY === '0' ? undefined : `calc(-1 * ${bleedY})`,
          marginBottom: bleedY === '0px' || bleedY === '0' ? undefined : `calc(-1 * ${bleedY})`,
        }}
        className="cms-hero-bleed relative flex w-full items-center overflow-hidden"
      >
        <HeroBackgroundFill
          mediaId={settings.media_id}
          url={String(settings.media_url || '')}
          alt={String(settings.media_alt || '')}
          editMode={editMode}
          objectPosition={String(settings.media_object_position || 'center center')}
        />
        {overlayStrength > 0.01 ? (
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background: `linear-gradient(105deg, rgb(0 0 0 / ${overlayStrength * 0.82}) 0%, rgb(0 0 0 / ${overlayStrength * 0.45}) 42%, rgb(0 0 0 / ${overlayStrength * 0.18}) 100%)`,
            }}
            aria-hidden
          />
        ) : null}
        <div
          className={clsx(
            'cms-hero-inner relative z-10 mx-auto w-full max-w-[var(--container,72rem)] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20',
            align === 'center' && 'flex justify-center',
          )}
        >
          {inner}
        </div>
      </div>
    )
  }

  const media = <MediaBox {...mediaProps} />

  if (layout === 'stack') {
    return (
      <div style={styles} className="space-y-10">
        {inner}
        {media}
      </div>
    )
  }

  return (
    <div
      style={styles}
      className={clsx(
        'grid items-center gap-10 lg:grid-cols-[1fr_0.95fr] lg:gap-14',
        reverse && 'lg:[&>*:first-child]:order-2',
      )}
    >
      {inner}
      {media}
    </div>
  )
}

function CompareBlockRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const styles = stylesToCss(readStyles(settings))
  const leftItems = String(settings.left_items || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const rightItems = String(settings.right_items || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const surface = 'rounded-[var(--radius)] border border-white/10 bg-[color:var(--surface)] p-6 md:p-8'

  return (
    <div style={styles}>
      {(settings.title || editMode) ? (
        <EditableText
          field="title"
          label="Заголовок"
          value={String(settings.title || '')}
          as="h2"
          className="break-words font-[family-name:var(--font-heading)] text-[clamp(1.5rem,6vw,2.25rem)] font-semibold tracking-[-0.03em] text-[color:var(--text)] md:text-4xl"
          placeholder="Заголовок"
        />
      ) : null}
      {(settings.subtitle || editMode) ? (
        <EditableText
          field="subtitle"
          label="Подзаголовок"
          value={String(settings.subtitle || '')}
          as="p"
          multiline
          className="mt-4 max-w-3xl text-base leading-7 text-[color:var(--muted)]"
          placeholder="Подзаголовок"
        />
      ) : null}
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <article className={surface}>
          <EditableText field="left_title" label="Левая колонка" value={String(settings.left_title || '')} as="h3" className="text-xl font-semibold" placeholder="Колонка A" />
          <ul className="mt-6 space-y-3 text-sm leading-6 text-[color:var(--muted)]">
            {leftItems.map((item, i) => (
              <li key={i} className="flex gap-3">
                <AppIcon name="server" size={17} className="mt-1 shrink-0 text-[color:var(--primary)]" />
                <span>{item}</span>
              </li>
            ))}
            {!leftItems.length && editMode ? <li className="text-[color:var(--muted)]">Пункты слева (по строке)</li> : null}
          </ul>
        </article>
        <article className={clsx(surface, 'border-[color:var(--primary)]/35')}>
          <EditableText field="right_title" label="Правая колонка" value={String(settings.right_title || '')} as="h3" className="text-xl font-semibold" placeholder="Колонка B" />
          <ul className="mt-6 space-y-3 text-sm leading-6 text-[color:var(--muted)]">
            {rightItems.map((item, i) => (
              <li key={i} className="flex gap-3">
                <AppIcon name="check" size={17} className="mt-1 shrink-0 text-[color:var(--primary)]" />
                <span>{item}</span>
              </li>
            ))}
            {!rightItems.length && editMode ? <li className="text-[color:var(--muted)]">Пункты справа (по строке)</li> : null}
          </ul>
        </article>
      </div>
      {(settings.footnote || editMode) ? (
        <EditableText
          field="footnote"
          label="Сноска"
          value={String(settings.footnote || '')}
          as="p"
          multiline
          className="mt-6 text-sm leading-6 text-[color:var(--muted)]"
          placeholder="Сноска"
        />
      ) : null}
    </div>
  )
}

function ShowcaseBlockRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const styles = stylesToCss(readStyles(settings))
  const reverse = settings.reverse === true
  const points = String(settings.points || '').split('\n').map((s) => s.trim()).filter(Boolean)

  return (
    <article
      style={styles}
      className={clsx('grid items-center gap-8 md:grid-cols-2 md:gap-14', reverse && 'md:[&>*:first-child]:order-2')}
    >
      <div>
        <EditableText
          field="title"
          label="Заголовок"
          value={String(settings.title || '')}
          as="h3"
          className="font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-[-0.025em] md:text-3xl"
          placeholder="Заголовок"
        />
        <EditableText
          field="body"
          label="Текст"
          value={String(settings.body || '')}
          as="p"
          multiline
          className="mt-4 max-w-xl leading-7 text-[color:var(--muted)]"
          placeholder="Описание"
        />
        {points.length || editMode ? (
          <ul className="mt-6 space-y-3">
            {(points.length ? points : editMode ? ['Пункт'] : []).map((p, i) => (
              <li key={i} className="flex gap-3 text-sm leading-6 text-[color:var(--text)]">
                <AppIcon name="check" size={18} className="mt-1 shrink-0 text-[color:var(--primary)]" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <MediaBox
        mediaId={settings.media_id}
        url={String(settings.media_url || '')}
        alt={String(settings.media_alt || '')}
        ratio={String(settings.media_ratio || '16/9')}
        placeholder={String(settings.media_placeholder || 'Showcase')}
        editMode={editMode}
        settings={settings}
        width={settings.media_width ? String(settings.media_width) : undefined}
        height={settings.media_height ? String(settings.media_height) : undefined}
        objectFit={settings.media_object_fit ? String(settings.media_object_fit) : undefined}
      />
    </article>
  )
}

function CtaBlockRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const styles = stylesToCss(readStyles(settings))
  const layout = String(settings.layout || 'split')
  const copy = (
    <div>
      <EditableText
        field="title"
        label="Заголовок"
        value={String(settings.title || '')}
        as="h2"
        className="break-words font-[family-name:var(--font-heading)] text-[clamp(1.5rem,6vw,2.25rem)] font-semibold tracking-[-0.03em] md:text-4xl"
        placeholder="CTA"
      />
      <EditableText
        field="subtitle"
        label="Подзаголовок"
        value={String(settings.subtitle || '')}
        as="p"
        multiline
        className="mt-4 max-w-xl text-sm leading-6 text-[color:var(--muted)] sm:text-base sm:leading-7"
        placeholder="Текст"
      />
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Cta label={String(settings.cta1_label || '')} href={String(settings.cta1_href || '#')} variant="solid" editMode={editMode} field="cta1_label" />
        <Cta label={String(settings.cta2_label || '')} href={String(settings.cta2_href || '#')} variant="ghost" editMode={editMode} field="cta2_label" />
      </div>
    </div>
  )
  const media = settings.show_media !== false ? (
    <MediaBox
      mediaId={settings.media_id}
      url={String(settings.media_url || '')}
      alt={String(settings.media_alt || '')}
      ratio={String(settings.media_ratio || '16/9')}
      placeholder="CTA media"
      editMode={editMode}
      settings={settings}
      width={settings.media_width ? String(settings.media_width) : undefined}
      height={settings.media_height ? String(settings.media_height) : undefined}
      objectFit={settings.media_object_fit ? String(settings.media_object_fit) : undefined}
    />
  ) : null

  if (layout === 'center' || !media) {
    return <div style={styles} className="mx-auto max-w-3xl text-center">{copy}</div>
  }
  return (
    <div style={styles} className="grid items-center gap-10 lg:grid-cols-2">
      {copy}
      {media}
    </div>
  )
}

function StatRowRender({ settings }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const items = asRows(settings.items)
  const styles = stylesToCss(readStyles(settings))
  if (!items.length) return null
  return (
    <div style={styles} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, i) => (
        <div key={i} className="rounded-[var(--radius)] border border-white/10 bg-[color:var(--surface)] p-5 text-center">
          <p className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-[color:var(--text)]">{String(item.value || '')}</p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{String(item.label || '')}</p>
        </div>
      ))}
    </div>
  )
}

export function registerBlockWidgets() {
  registerWidget({
    type: 'media-placeholder',
    label: 'Медиа / Placeholder',
    category: 'basic',
    defaultSettings: {
      media_id: null,
      url: '',
      alt: '',
      ratio: '16/9',
      placeholder: 'Рекомендуемый размер 1600×1000',
      caption: '',
    },
    settingsFields: fields(
      { key: 'media_id', label: 'Медиа', type: 'media' },
      { key: 'url', label: 'Или URL', type: 'url' },
      { key: 'alt', label: 'Alt', type: 'text' },
      { key: 'placeholder', label: 'Текст placeholder', type: 'text' },
      { key: 'caption', label: 'Подпись', type: 'text' },
      { key: 'ratio', label: 'Пропорции', type: 'select', options: [
        { value: '16/9', label: '16:9' }, { value: '4/3', label: '4:3' }, { value: '4/5', label: '4:5' }, { value: 'square', label: '1:1' },
      ] },
    ),
    Render: MediaPlaceholderRender,
  })

  registerWidget({
    type: 'hero-block',
    label: 'Hero-блок',
    category: 'landing',
    acceptsChildren: true,
    defaultSettings: {
      badge: 'Product · Platform · AI',
      title_1: 'Собирайте страницы без кода.',
      title_2: 'Публикуйте без лишней инфраструктуры.',
      body: 'Универсальный hero для любой посадочной: бейдж, заголовки, CTA, чипы и медиа.',
      cta1_label: 'Начать',
      cta1_href: '/docs',
      cta2_label: 'Смотреть демо',
      cta2_href: '#',
      layout: 'split',
      align: 'left',
      image_position: 'right',
      media_mode: 'background',
      height_preset: 'viewport',
      media_id: null,
      media_url: '',
      media_alt: '',
      media_ratio: '4/3',
      media_width: '',
      media_height: '',
      media_object_fit: 'cover',
      media_object_position: 'center center',
      media_overlay: '0.35',
      media_min_height: HERO_HEIGHT_PRESETS.viewport.minHeight,
      media_bleed_y: '0px',
      media_placeholder: 'Hero visual',
      chips: [{ label: 'Page Builder' }, { label: 'MCP' }, { label: 'Shared Hosting' }],
    },
    settingsFields: fields(
      { key: 'badge', label: 'Бейдж', type: 'text' },
      { key: 'title_1', label: 'Заголовок 1', type: 'text' },
      { key: 'title_2', label: 'Заголовок 2', type: 'text' },
      { key: 'body', label: 'Текст', type: 'textarea' },
      { key: 'cta1_label', label: 'Кнопка 1', type: 'text' },
      { key: 'cta1_href', label: 'Ссылка 1', type: 'url' },
      { key: 'cta2_label', label: 'Кнопка 2', type: 'text' },
      { key: 'cta2_href', label: 'Ссылка 2', type: 'url' },
      { key: 'layout', label: 'Компоновка (если медиа сбоку)', type: 'select', options: [
        { value: 'split', label: 'Текст + медиа' }, { value: 'stack', label: 'Стек' },
      ] },
      { key: 'align', label: 'Выравнивание текста', type: 'select', options: [
        { value: 'left', label: 'Слева' }, { value: 'center', label: 'По центру' },
      ] },
      { key: 'media_mode', label: 'Роль медиа', type: 'select', options: [
        { value: 'background', label: 'Фон на всё пространство' },
        { value: 'side', label: 'Сбоку / в колонке' },
      ] },
      { key: 'height_preset', label: 'Высота (шаблон)', type: 'select', options: [
        { value: 'viewport', label: 'На весь экран (основной)' },
        { value: 'tall', label: 'Высокий' },
        { value: 'compact', label: 'Компактный' },
        { value: 'custom', label: 'Свой размер' },
      ] },
      { key: 'image_position', label: 'Позиция (если сбоку)', type: 'select', options: [
        { value: 'right', label: 'Справа' }, { value: 'left', label: 'Слева' },
      ] },
      { key: 'media_id', label: 'Фон: фото или видео', type: 'media' },
      { key: 'media_url', label: 'Или URL (jpg/mp4/…)', type: 'url' },
      { key: 'media_alt', label: 'Alt', type: 'text' },
      { key: 'media_ratio', label: 'Пропорции (сбоку)', type: 'select', options: [
        { value: '16/9', label: '16:9' }, { value: '4/3', label: '4:3' }, { value: 'square', label: '1:1' }, { value: 'auto', label: 'Авто (по файлу)' },
      ] },
      { key: 'media_width', label: 'Ширина медиа (100% / 28rem)', type: 'text' },
      { key: 'media_height', label: 'Высота медиа (auto / 320px)', type: 'text' },
      { key: 'media_object_fit', label: 'Object-fit (режим сбоку)', type: 'select', options: [
        { value: 'cover', label: 'Cover (обрезать)' },
        { value: 'contain', label: 'Contain (вписать)' },
        { value: 'fill', label: 'Fill (растянуть)' },
        { value: 'none', label: 'None' },
      ] },
      { key: 'media_object_position', label: 'Позиция фона (center / top / 70% center)', type: 'text' },
      { key: 'media_min_height', label: 'Свой min-height (шаблон «Свой»)', type: 'text' },
      { key: 'media_bleed_y', label: 'Bleed по вертикали (шаблон «Свой»)', type: 'text' },
      { key: 'media_overlay', label: 'Затемнение фона 0–1 (0 = без затемнения)', type: 'text' },
      {
        key: 'chips',
        label: 'Чипы',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Чип"
            blank={() => ({ label: '' })}
            fields={[{ key: 'label', label: 'Текст', kind: 'text' }]}
          />
        ),
      },
    ),
    Render: HeroBlockRender,
  })

  registerWidget({
    type: 'compare-block',
    label: 'Сравнение колонок',
    category: 'landing',
    defaultSettings: {
      title: 'Сравните подходы',
      subtitle: 'Две колонки пунктов — универсальный comparison-блок.',
      left_title: 'Вариант A',
      right_title: 'Вариант B',
      left_items: 'Пункт 1\nПункт 2\nПункт 3',
      right_items: 'Пункт 1\nПункт 2\nПункт 3',
      footnote: '',
    },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'left_title', label: 'Левый заголовок', type: 'text' },
      { key: 'left_items', label: 'Левые пункты (по строке)', type: 'textarea' },
      { key: 'right_title', label: 'Правый заголовок', type: 'text' },
      { key: 'right_items', label: 'Правые пункты (по строке)', type: 'textarea' },
      { key: 'footnote', label: 'Сноска', type: 'textarea' },
    ),
    Render: CompareBlockRender,
  })

  registerWidget({
    type: 'showcase-block',
    label: 'Showcase (текст + медиа)',
    category: 'landing',
    defaultSettings: {
      title: 'Покажите продукт',
      body: 'Заголовок, описание, пункты и медиа — для любой фичи или экрана.',
      points: 'Пункт один\nПункт два\nПункт три',
      reverse: false,
      media_id: null,
      media_url: '',
      media_alt: '',
      media_ratio: '16/9',
      media_placeholder: '1600 × 1000',
    },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'body', label: 'Текст', type: 'textarea' },
      { key: 'points', label: 'Пункты (по строке)', type: 'textarea' },
      { key: 'reverse', label: 'Медиа слева', type: 'toggle' },
      { key: 'media_id', label: 'Медиа', type: 'media' },
      { key: 'media_url', label: 'Или URL', type: 'url' },
      { key: 'media_alt', label: 'Alt', type: 'text' },
      { key: 'media_ratio', label: 'Пропорции', type: 'select', options: [
        { value: '16/9', label: '16:9' }, { value: '4/3', label: '4:3' }, { value: 'square', label: '1:1' },
      ] },
      { key: 'media_placeholder', label: 'Placeholder', type: 'text' },
    ),
    Render: ShowcaseBlockRender,
  })

  registerWidget({
    type: 'cta-block',
    label: 'CTA-блок',
    category: 'landing',
    defaultSettings: {
      title: 'Готовы начать?',
      subtitle: 'Универсальный финальный призыв с кнопками и опциональным медиа.',
      cta1_label: 'Начать',
      cta1_href: '/docs',
      cta2_label: 'Документация',
      cta2_href: '/docs',
      layout: 'split',
      show_media: true,
      media_id: null,
      media_url: '',
      media_alt: '',
      media_ratio: '16/9',
    },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'cta1_label', label: 'Кнопка 1', type: 'text' },
      { key: 'cta1_href', label: 'Ссылка 1', type: 'url' },
      { key: 'cta2_label', label: 'Кнопка 2', type: 'text' },
      { key: 'cta2_href', label: 'Ссылка 2', type: 'url' },
      { key: 'layout', label: 'Компоновка', type: 'select', options: [
        { value: 'split', label: 'Текст + медиа' }, { value: 'center', label: 'По центру' },
      ] },
      { key: 'show_media', label: 'Показать медиа', type: 'toggle' },
      { key: 'media_id', label: 'Медиа', type: 'media' },
      { key: 'media_url', label: 'Или URL', type: 'url' },
      { key: 'media_alt', label: 'Alt', type: 'text' },
    ),
    Render: CtaBlockRender,
  })

  registerWidget({
    type: 'stat-row',
    label: 'Ряд метрик',
    category: 'landing',
    defaultSettings: {
      items: [
        { value: '11', label: 'Секций' },
        { value: '40+', label: 'Виджетов' },
        { value: '1', label: 'ZIP-деплой' },
        { value: 'MCP', label: 'для AI' },
      ],
    },
    settingsFields: fields(
      {
        key: 'items',
        label: 'Метрики',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Метрика"
            blank={() => ({ value: '', label: '' })}
            fields={[
              { key: 'value', label: 'Значение', kind: 'text' },
              { key: 'label', label: 'Подпись', kind: 'text' },
            ]}
          />
        ),
      },
    ),
    Render: StatRowRender,
  })
}
