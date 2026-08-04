import { MediaImage, RichText } from '@/components/ui'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { EditableButton, EditableText } from '@/builder/edit/Editable'
import { ItemsEditor } from '@/builder/edit/ItemsEditor'
import { readStyles, stylesToCss } from '@/builder/edit/StyleFields'
import { sanitizeHtml } from '@/shared/sanitize'
import { useProductEntity } from '@/builder/context/ProductEntityContext'
import { isFieldDynamic, resolveBound, resolveBoundString } from '@/builder/bind/resolveBound'
import type { CSSProperties } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'

function fields(...items: SettingsField[]) {
  return items
}

function alignBoxClass(align: string): string {
  if (align === 'center') return 'mx-auto'
  if (align === 'right') return 'ml-auto'
  return ''
}

function HeadingRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const product = useProductEntity()
  const Tag = (String(settings.tag || 'h2') as 'h1' | 'h2' | 'h3' | 'h4')
  const align = String(settings.align || 'left')
  const sizeClass = settings.size === 'xl'
    ? 'text-[2.15rem] sm:text-5xl lg:text-6xl'
    : settings.size === 'lg'
      ? 'text-3xl sm:text-4xl'
      : 'text-2xl'
  const elementStyles = readStyles(settings)
  const styles = stylesToCss(elementStyles)
  const text = resolveBoundString(settings, 'text', { product, editMode }, 'Заголовок')
  const dynamic = isFieldDynamic(settings, 'text')
  const legacyColor = !elementStyles.color && settings.color ? String(settings.color) : ''
  // Widget align wins over empty styles; explicit styles.textAlign still overrides.
  const textAlign = (elementStyles.textAlign || align) as 'left' | 'center' | 'right'
  const style: CSSProperties = {
    ...styles,
    ...(legacyColor ? stylesToCss({ color: legacyColor }) : {}),
    textAlign,
  }

  if (dynamic) {
    return (
      <Tag
        className={`block w-full font-heading font-semibold tracking-[-0.04em] ${sizeClass}`}
        style={style}
      >
        {text}
        {editMode ? <span className="ml-2 text-[10px] font-normal text-zinc-500">↻ товар</span> : null}
      </Tag>
    )
  }

  return (
    <EditableText
      field="text"
      label="Заголовок"
      value={text}
      as={Tag}
      className={`block w-full font-heading font-semibold tracking-[-0.04em] ${sizeClass}`}
      style={style}
    />
  )
}

function TextRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const product = useProductEntity()
  const align = String(settings.align || 'left')
  const styles = stylesToCss(readStyles(settings))
  const box = `prose max-w-3xl w-full ${alignBoxClass(align)}`
  const style = {
    textAlign: (styles.textAlign || align) as 'left' | 'center' | 'right',
    ...styles,
  }
  const html = resolveBoundString(settings, 'html', { product, editMode }, '<p>Текст…</p>')
  const dynamic = isFieldDynamic(settings, 'html')

  if (dynamic) {
    return (
      <div className={box} style={style}>
        <RichText html={html.includes('<') ? html : `<p>${html}</p>`} />
        {editMode ? <p className="mt-1 text-[10px] text-zinc-500">↻ из товара</p> : null}
      </div>
    )
  }

  if (editMode) {
    return (
      <EditableText
        field="html"
        label="Текст"
        value={String(settings.html || '').replace(/<[^>]+>/g, ' ').trim() || 'Текст…'}
        as="div"
        multiline
        className={box}
        style={style}
        placeholder="Текст…"
      />
    )
  }
  return (
    <div className={box} style={style}>
      <RichText html={html} />
    </div>
  )
}

function ImageRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const product = useProductEntity()
  const mediaId = resolveBound(settings, 'media_id', { product, editMode })
  const url = String(settings.url || '').trim()
  const alt = resolveBoundString(settings, 'alt', { product, editMode }, '')
  const ratioStyle = { aspectRatio: settings.ratio === 'square' ? '1' : settings.ratio === '4/5' ? '4/5' : settings.ratio === '4/3' ? '4/3' : '16/9' }

  if (!mediaId && !url) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-[var(--radius)] border border-dashed border-white/15 text-sm text-[var(--muted)]">
        {isFieldDynamic(settings, 'media_id')
          ? (editMode ? 'Обложка товара (нет media_id у демо)' : 'Нет изображения')
          : 'Выберите изображение или URL'}
      </div>
    )
  }
  if (!mediaId && url) {
    return (
      <img
        src={url}
        alt={alt}
        className="w-full rounded-[var(--radius)] object-cover"
        style={ratioStyle}
      />
    )
  }
  return (
    <MediaImage
      media={mediaId as never}
      alt={alt}
      className="w-full rounded-[var(--radius)] object-cover"
      style={ratioStyle}
    />
  )
}

function ButtonRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const product = useProductEntity()
  const align = String(settings.align || 'left')
  const wrap = align === 'center' ? 'flex justify-center' : align === 'right' ? 'flex justify-end' : ''
  const label = resolveBoundString(settings, 'label', { product, editMode }, 'Кнопка')
  const href = resolveBoundString(settings, 'href', { product, editMode }, '#')
  const dynamicLabel = isFieldDynamic(settings, 'label')
  const dynamicHref = isFieldDynamic(settings, 'href')
  const styles = stylesToCss(readStyles(settings))
  const ghost = settings.variant === 'ghost'
  const btnStyle: CSSProperties = {
    ...styles,
    ...(styles.backgroundColor
      ? { backgroundColor: ghost ? (styles.backgroundColor || 'transparent') : styles.backgroundColor }
      : {}),
    ...(styles.color ? { color: styles.color } : {}),
  }

  if (dynamicLabel || dynamicHref) {
    const Tag = editMode ? 'span' : 'a'
    return (
      <div className={wrap || undefined}>
        <Tag
          {...(!editMode ? { href } : {})}
          className={
            ghost
              ? 'inline-flex rounded-lg border border-white/20 px-4 py-2 text-sm'
              : 'inline-flex rounded-lg bg-[var(--accent,#2563eb)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground,#fff)]'
          }
          style={btnStyle}
        >
          {label}
          {editMode && (dynamicLabel || dynamicHref) ? (
            <span className="ml-2 text-[10px] opacity-60">↻</span>
          ) : null}
        </Tag>
      </div>
    )
  }

  return (
    <div className={wrap || undefined}>
      <EditableButton
        labelField="label"
        hrefField="href"
        label={label}
        href={href}
        variant={ghost ? 'ghost' : 'solid'}
        style={btnStyle}
      />
    </div>
  )
}

function SpacerRender({ settings }: { settings: Record<string, unknown> }) {
  const styles = stylesToCss(readStyles(settings))
  return (
    <div
      style={{ height: String(settings.height || '2rem'), ...styles }}
      aria-hidden
    />
  )
}

function DividerRender() {
  return <hr className="border-white/[0.08]" />
}

function HtmlRender({ settings }: { settings: Record<string, unknown> }) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(settings.html || '')) }} />
}

function PageLoaderRender({ settings }: { settings: Record<string, unknown> }) {
  const text = String(settings.text || 'Загрузка')
  const subtitle = String(settings.subtitle || '')
  const variant = String(settings.variant || 'spinner')
  const fullscreen = settings.fullscreen !== false && settings.fullscreen !== 0
  const color = String(settings.color || 'var(--accent, #8eb6ff)')
  const mediaId = settings.media_id

  const indicator =
    variant === 'dots' ? (
      <div className="flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-2 w-2 rounded-full animate-pulse"
            style={{ background: color, animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    ) : variant === 'bar' ? (
      <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div
          className="h-full w-1/3 animate-pulse rounded-full"
          style={{ background: color, animationDuration: '1s' }}
        />
      </div>
    ) : (
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-white/15"
        style={{ borderTopColor: color }}
        aria-hidden
      />
    )

  const inner = (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-10 text-center" role="status" aria-live="polite">
      {mediaId ? (
        <MediaImage media={mediaId as never} alt="" className="h-12 w-12 rounded-lg object-contain" />
      ) : null}
      {indicator}
      <div>
        <EditableText
          field="text"
          label="Текст"
          value={text}
          as="p"
          className="font-heading text-sm font-medium tracking-wide text-zinc-100"
        />
        {subtitle ? (
          <EditableText
            field="subtitle"
            label="Подпись"
            value={subtitle}
            as="p"
            className="mt-1 text-xs text-zinc-500"
          />
        ) : null}
      </div>
    </div>
  )

  if (!fullscreen) return inner
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      {inner}
    </div>
  )
}

/** Same look as product-landing hero chips. */
const chipClass =
  'inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-[color:var(--muted)]'

function ChipRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const label = String(settings.label || settings.text || '')
  const href = String(settings.href || '').trim()
  const styles = stylesToCss(readStyles(settings))
  const align = String(settings.align || 'left')
  const wrapClass = clsx(
    'w-fit max-w-full',
    align === 'center' && 'mx-auto',
    align === 'right' && 'ml-auto',
  )

  if (editMode) {
    return (
      <div className={wrapClass} style={styles}>
        <EditableText
          field="label"
          label="Чип"
          value={label}
          as="span"
          className={chipClass}
          placeholder="Чип"
        />
      </div>
    )
  }

  if (!label) return null
  if (href) {
    const external = href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')
    if (external) {
      return (
        <div className={wrapClass} style={styles}>
          <a href={href} className={chipClass}>{label}</a>
        </div>
      )
    }
    return (
      <div className={wrapClass} style={styles}>
        <Link to={href} className={chipClass}>{label}</Link>
      </div>
    )
  }
  return (
    <div className={wrapClass} style={styles}>
      <span className={chipClass}>{label}</span>
    </div>
  )
}

function ChipRowRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const items = Array.isArray(settings.items)
    ? (settings.items as Array<Record<string, unknown>>)
    : []
  const styles = stylesToCss(readStyles(settings))
  const align = String(settings.align || 'left')
  const rowClass = clsx(
    'flex flex-wrap gap-2',
    align === 'center' && 'justify-center',
    align === 'right' && 'justify-end',
  )

  if (!items.length) {
    if (!editMode) return null
    return (
      <div className={rowClass} style={styles}>
        <span className={clsx(chipClass, 'border-dashed opacity-60')}>Добавьте чипы в настройках</span>
      </div>
    )
  }

  return (
    <div className={rowClass} style={styles}>
      {items.map((item, i) => {
        const label = String(item.label || item.text || '')
        const href = String(item.href || '').trim()
        if (!label) return null
        if (editMode || !href) {
          return <span key={i} className={chipClass}>{label}</span>
        }
        const external = href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')
        if (external) {
          return <a key={i} href={href} className={chipClass}>{label}</a>
        }
        return <Link key={i} to={href} className={chipClass}>{label}</Link>
      })}
    </div>
  )
}

export function registerBasicWidgets() {
  registerWidget({
    type: 'heading',
    label: 'Заголовок',
    category: 'basic',
    defaultSettings: { text: 'Заголовок', tag: 'h2', size: 'lg', align: 'left' },
    settingsFields: fields(
      { key: 'text', label: 'Текст', type: 'text', bindable: true },
      { key: 'tag', label: 'HTML-тег (SEO, не размер)', type: 'select', options: [
        { value: 'h1', label: 'H1 — главный заголовок страницы' },
        { value: 'h2', label: 'H2 — секция' },
        { value: 'h3', label: 'H3 — подсекция' },
        { value: 'h4', label: 'H4 — мелкий' },
      ] },
      { key: 'size', label: 'Визуальный размер', type: 'select', options: [
        { value: 'md', label: 'Обычный' }, { value: 'lg', label: 'Крупный' }, { value: 'xl', label: 'Очень крупный' },
      ] },
      { key: 'align', label: 'Выравнивание', type: 'select', options: [
        { value: 'left', label: 'Слева' }, { value: 'center', label: 'По центру' }, { value: 'right', label: 'Справа' },
      ] },
      { key: 'color', label: 'Цвет', type: 'color' },
    ),
    Render: HeadingRender,
  })

  registerWidget({
    type: 'text',
    label: 'Текст',
    category: 'basic',
    defaultSettings: { html: '<p>Напишите текст…</p>', align: 'left' },
    settingsFields: fields(
      { key: 'html', label: 'Контент', type: 'richtext', bindable: true },
      { key: 'align', label: 'Выравнивание', type: 'select', options: [
        { value: 'left', label: 'Слева' }, { value: 'center', label: 'По центру' }, { value: 'right', label: 'Справа' },
      ] },
    ),
    Render: TextRender,
  })

  registerWidget({
    type: 'image',
    label: 'Изображение',
    category: 'basic',
    defaultSettings: { media_id: null, url: '', alt: '', ratio: '16/9' },
    settingsFields: fields(
      { key: 'media_id', label: 'Медиа', type: 'media', bindable: true },
      { key: 'url', label: 'Или URL (если нет медиа)', type: 'url' },
      { key: 'alt', label: 'Alt', type: 'text', bindable: true },
      { key: 'ratio', label: 'Пропорции', type: 'select', options: [
        { value: '16/9', label: '16:9' }, { value: '4/3', label: '4:3' }, { value: '4/5', label: '4:5' }, { value: 'square', label: '1:1' },
      ] },
    ),
    Render: ImageRender,
  })

  registerWidget({
    type: 'button',
    label: 'Кнопка',
    category: 'basic',
    defaultSettings: { label: 'Подробнее', href: '/', variant: 'solid', new_tab: false, align: 'left' },
    settingsFields: fields(
      { key: 'label', label: 'Текст', type: 'text', bindable: true },
      { key: 'href', label: 'Ссылка', type: 'url', bindable: true },
      { key: 'variant', label: 'Стиль', type: 'select', options: [
        { value: 'solid', label: 'Основная' }, { value: 'ghost', label: 'Контур' },
      ] },
      { key: 'align', label: 'Выравнивание', type: 'select', options: [
        { value: 'left', label: 'Слева' }, { value: 'center', label: 'По центру' }, { value: 'right', label: 'Справа' },
      ] },
      { key: 'new_tab', label: 'В новой вкладке', type: 'toggle' },
    ),
    Render: ButtonRender,
  })

  registerWidget({
    type: 'spacer',
    label: 'Отступ',
    category: 'basic',
    defaultSettings: { height: '2rem' },
    settingsFields: fields(
      { key: 'height', label: 'Высота', type: 'text' },
    ),
    Render: SpacerRender,
  })

  registerWidget({
    type: 'divider',
    label: 'Разделитель',
    category: 'basic',
    defaultSettings: {},
    settingsFields: [],
    Render: DividerRender,
  })

  registerWidget({
    type: 'html',
    label: 'HTML',
    category: 'basic',
    defaultSettings: { html: '<div>Custom HTML</div>' },
    settingsFields: fields(
      { key: 'html', label: 'HTML', type: 'textarea' },
    ),
    Render: HtmlRender,
  })

  registerWidget({
    type: 'page-loader',
    label: 'Lazy loader',
    category: 'basic',
    defaultSettings: {
      text: 'Загрузка',
      subtitle: 'Подождите немного…',
      variant: 'spinner',
      fullscreen: true,
      media_id: null,
      color: '',
    },
    settingsFields: fields(
      { key: 'text', label: 'Текст', type: 'text' },
      { key: 'subtitle', label: 'Подпись', type: 'text' },
      { key: 'variant', label: 'Индикатор', type: 'select', options: [
        { value: 'spinner', label: 'Спиннер' },
        { value: 'dots', label: 'Точки' },
        { value: 'bar', label: 'Полоска' },
      ] },
      { key: 'color', label: 'Цвет индикатора', type: 'color' },
      { key: 'media_id', label: 'Логотип / иконка', type: 'media' },
      { key: 'fullscreen', label: 'По центру экрана', type: 'toggle' },
    ),
    Render: PageLoaderRender,
  })

  registerWidget({
    type: 'chip',
    label: 'Чип',
    category: 'basic',
    defaultSettings: { label: 'Shared Hosting Ready', href: '', align: 'left' },
    settingsFields: fields(
      { key: 'label', label: 'Текст', type: 'text' },
      { key: 'href', label: 'Ссылка (необязательно)', type: 'url' },
      { key: 'align', label: 'Выравнивание', type: 'select', options: [
        { value: 'left', label: 'Слева' }, { value: 'center', label: 'По центру' }, { value: 'right', label: 'Справа' },
      ] },
    ),
    Render: ChipRender,
  })

  registerWidget({
    type: 'chip-row',
    label: 'Ряд чипов',
    category: 'basic',
    defaultSettings: {
      align: 'left',
      items: [
        { label: 'Локальная сборка', href: '' },
        { label: 'MCP для AI-агентов', href: '' },
        { label: 'Update ZIP', href: '' },
        { label: 'Shared Hosting Ready', href: '' },
      ],
    },
    settingsFields: fields(
      { key: 'align', label: 'Выравнивание', type: 'select', options: [
        { value: 'left', label: 'Слева' }, { value: 'center', label: 'По центру' }, { value: 'right', label: 'Справа' },
      ] },
      {
        key: 'items',
        label: 'Чипы',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Чип"
            blank={() => ({ label: '', href: '' })}
            fields={[
              { key: 'label', label: 'Текст', kind: 'text' },
              { key: 'href', label: 'Ссылка', kind: 'url' },
            ]}
          />
        ),
      },
    ),
    Render: ChipRowRender,
  })
}
