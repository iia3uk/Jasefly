import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { useInView, useReducedMotion } from 'framer-motion'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { EditableShell, EditableText } from '@/builder/edit/Editable'
import { ItemsEditor } from '@/builder/edit/ItemsEditor'
import { readFieldStyles, readStyles, stylesToCss } from '@/builder/edit/StyleFields'
import { useBuilderEdit } from '@/builder/context/BuilderEditContext'

function fields(...items: SettingsField[]) {
  return items
}

type StepItem = { badge?: string; title?: string; text?: string }

function asSteps(value: unknown): StepItem[] {
  if (!Array.isArray(value)) return []
  return value.filter((x) => x && typeof x === 'object') as StepItem[]
}

/** Selectable chrome (line etc.) without EditableShell's w-fit. */
function SelectablePart({
  field,
  label,
  className,
  style,
  children,
}: {
  field: string
  label: string
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const ctx = useBuilderEdit()
  if (!ctx?.editMode) {
    return <div className={className} style={style}>{children}</div>
  }
  const selected = ctx.selectedId === ctx.elementId && ctx.selectedPart === field
  const fieldCss = stylesToCss(readFieldStyles(ctx.settings, field))
  return (
    <div
      data-builder-editable
      data-field={field}
      role="button"
      tabIndex={0}
      className={clsx(
        'relative transition',
        selected
          ? 'ring-2 ring-[var(--accent,#8eb6ff)] ring-offset-2 ring-offset-[var(--background,#0a0a0b)]'
          : 'hover:ring-1 hover:ring-white/35',
        className,
      )}
      style={{ ...style, ...fieldCss }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ctx.onSelectElement(ctx.elementId, { part: field })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          ctx.onSelectElement(ctx.elementId, { part: field })
        }
      }}
    >
      {selected && (
        <span className="pointer-events-none absolute -top-5 left-0 z-20 whitespace-nowrap rounded bg-[var(--accent,#8eb6ff)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black [color:#000] [-webkit-text-fill-color:#000]">
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

/** Inline edit for items[i][key] — patches the items array. */
function StepFieldEdit({
  items,
  index,
  itemKey,
  label,
  value,
  className,
  multiline,
  placeholder,
  as: Tag = 'span',
}: {
  items: StepItem[]
  index: number
  itemKey: keyof StepItem
  label: string
  value: string
  className?: string
  multiline?: boolean
  placeholder?: string
  as?: 'span' | 'h3' | 'p'
}) {
  const ctx = useBuilderEdit()
  const field = `step_${index}_${itemKey}`
  const ref = useRef<HTMLElement | null>(null)
  const fieldCss = stylesToCss(readFieldStyles(ctx?.settings, field))

  useEffect(() => {
    const el = ref.current
    if (!el || !ctx?.editMode) return
    if (document.activeElement === el) return
    if ((el.textContent ?? '') !== value) el.textContent = value
  }, [value, ctx?.editMode])

  const patch = (next: string) => {
    if (!ctx) return
    const copy = items.map((row, i) => (i === index ? { ...row, [itemKey]: next } : row))
    ctx.onPatch({ items: copy })
  }

  if (!ctx?.editMode) {
    if (!value && !placeholder) return null
    return (
      <Tag className={className} style={fieldCss}>
        {value || placeholder}
      </Tag>
    )
  }

  return (
    <EditableShell field={field} label={label} block={multiline || Tag === 'p' || Tag === 'h3'}>
      <Tag
        ref={ref as never}
        contentEditable
        suppressContentEditableWarning
        className={clsx('outline-none', className, !value && 'min-w-[2ch]')}
        style={fieldCss}
        onBlur={(e: FocusEvent<HTMLElement>) => {
          const next = e.currentTarget.textContent?.trim() ?? ''
          if (next !== value) patch(next)
        }}
        onInput={(e: FormEvent<HTMLElement>) => e.stopPropagation()}
        onMouseDown={(e: MouseEvent<HTMLElement>) => {
          e.stopPropagation()
          ctx.onSelectElement(ctx.elementId, { part: field })
        }}
        onClick={(e: MouseEvent<HTMLElement>) => {
          e.stopPropagation()
          ctx.onSelectElement(ctx.elementId, { part: field })
        }}
      />
    </EditableShell>
  )
}

function ConnectorLineRender({ settings }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const styles = stylesToCss(readStyles(settings))
  const insetLeft = String(settings.inset_left || '8%')
  const insetRight = String(settings.inset_right || '8%')
  const top = String(settings.top || '1.5rem')
  const thickness = String(settings.thickness || '1px')
  const color = String(settings.color || 'rgba(255,255,255,0.1)')
  const absolute = settings.absolute !== false

  const lineStyle: CSSProperties = {
    ...styles,
    ...(absolute ? { left: insetLeft, right: insetRight, top } : {}),
    height: styles.height || thickness,
    backgroundColor: styles.backgroundColor || color,
    ...(!absolute ? { width: styles.width || '100%' } : {}),
  }

  return (
    <SelectablePart
      field="connector"
      label="Линия"
      className={clsx(absolute ? 'absolute z-0 hidden md:block' : 'relative block w-full')}
      style={lineStyle}
    />
  )
}

function StepBadgeRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const label = String(settings.label || settings.text || '1')
  const styles = stylesToCss(readStyles(settings))
  const filled = settings.filled === true
  const size = String(settings.size || '3rem')
  const className = clsx(
    'inline-flex shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
    filled
      ? 'border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--background)]'
      : 'border-white/15 bg-[color:var(--background)] text-[color:var(--muted)]',
  )
  const style = { ...styles, width: styles.width || size, height: styles.height || size }

  if (editMode) {
    return (
      <EditableText
        field="label"
        label="Номер"
        value={label}
        as="span"
        className={className}
        style={style}
        placeholder="1"
      />
    )
  }
  return (
    <span className={className} style={style}>
      {label}
    </span>
  )
}

function StepsRowRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const items = asSteps(settings.items)
  const animate = settings.animate !== false
  const showLine = settings.show_line !== false
  const styles = stylesToCss(readStyles(settings))
  const lineStyles = stylesToCss(readFieldStyles(settings, 'connector'))
  const reducedMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.35 })
  const [active, setActive] = useState(reducedMotion || !animate || editMode ? items.length : 0)
  const stepCount = Math.max(1, items.length || 1)

  useEffect(() => {
    if (!animate || editMode || reducedMotion || !inView) return
    const timers = items.map((_, index) => setTimeout(() => setActive(index + 1), index * 220))
    return () => timers.forEach(clearTimeout)
  }, [animate, editMode, reducedMotion, inView, items.length])

  const insetLeft = String(settings.line_inset_left || '8%')
  const insetRight = String(settings.line_inset_right || '8%')
  const lineTop = String(settings.line_top || '1.5rem')

  return (
    <div ref={ref} className="relative min-w-0" style={styles}>
      {showLine ? (
        <SelectablePart
          field="connector"
          label="Линия пайплайна"
          className="absolute z-0 hidden lg:block"
          style={{
            left: insetLeft,
            right: insetRight,
            top: lineTop,
            height: lineStyles.height || '1px',
            backgroundColor: lineStyles.backgroundColor || 'rgba(255,255,255,0.1)',
            ...lineStyles,
          }}
        />
      ) : null}

      {/* Mobile/tablet: stack or 2-col. Desktop: all steps in one row (was always N-col → squeezed on phones). */}
      <div
        className="relative z-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:gap-2 lg:[grid-template-columns:repeat(var(--steps-n),minmax(0,1fr))]"
        style={{ ['--steps-n' as string]: String(stepCount) }}
      >
        {(items.length ? items : editMode ? [{ badge: '1', title: 'Шаг', text: 'Описание' }] : []).map((item, index) => {
          const filled = index < active
          const badgeClass = clsx(
            'flex size-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-300 sm:size-12 lg:mx-auto lg:mb-5',
            filled
              ? 'border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--background)]'
              : 'border-white/15 bg-[color:var(--background)] text-[color:var(--muted)]',
          )
          return (
            <div key={index} className="relative z-10 flex min-w-0 gap-3.5 sm:gap-4 lg:block lg:text-center">
              <StepFieldEdit
                items={items}
                index={index}
                itemKey="badge"
                label={`Шаг ${index + 1} · номер`}
                value={String(item.badge || index + 1)}
                as="span"
                className={badgeClass}
                placeholder={String(index + 1)}
              />
              <div className="min-w-0">
                <StepFieldEdit
                  items={items}
                  index={index}
                  itemKey="title"
                  label={`Шаг ${index + 1} · имя`}
                  value={String(item.title || '')}
                  as="h3"
                  className="break-words font-semibold text-[color:var(--text)]"
                  placeholder="Шаг"
                />
                <StepFieldEdit
                  items={items}
                  index={index}
                  itemKey="text"
                  label={`Шаг ${index + 1} · текст`}
                  value={String(item.text || '')}
                  as="p"
                  multiline
                  className="mt-1 break-words text-sm leading-6 text-[color:var(--muted)]"
                  placeholder="Описание"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ContentTabsRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const tabs = asSteps(settings.tabs).length
    ? (settings.tabs as Array<{ name?: string; items?: string }>)
    : []
  const styles = stylesToCss(readStyles(settings))
  const [selected, setSelected] = useState(0)
  const current = tabs[selected] || tabs[0]
  const lines = String(current?.items || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  if (!tabs.length && !editMode) return null

  return (
    <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]" style={styles}>
      <div role="tablist" className="flex gap-2 overflow-x-auto lg:flex-col">
        {(tabs.length ? tabs : [{ name: 'Вкладка' }]).map((tab, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={selected === index}
            onClick={() => setSelected(index)}
            className={clsx(
              'whitespace-nowrap rounded-[var(--radius)] border px-4 py-3 text-left text-sm font-semibold transition-colors',
              selected === index
                ? 'border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--background)]'
                : 'border-white/10 text-[color:var(--muted)] hover:bg-white/5',
            )}
          >
            {String(tab.name || `Вкладка ${index + 1}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="rounded-[var(--radius)] border border-white/10 bg-[color:var(--surface)] p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">
          {String(current?.name || '')}
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {lines.length ? lines.map((line, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 text-sm text-[color:var(--text)]">
              <span className="text-[color:var(--primary)]">✓</span>
              {line}
            </li>
          )) : (
            <li className="text-sm text-[color:var(--muted)]">
              {editMode ? 'Добавьте пункты во вкладке (по строке)' : null}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

const DEFAULT_STEPS: StepItem[] = [
  { badge: '1', title: 'Develop', text: 'Frontend, backend и контент редактируются локально.' },
  { badge: '2', title: 'Build', text: 'Vite собирает React и TypeScript в production-assets.' },
  { badge: '3', title: 'Test', text: 'Проверки выполняются до упаковки проекта.' },
  { badge: '4', title: 'Package', text: 'Формируется install- или update-ZIP.' },
  { badge: '5', title: 'Upload', text: 'Пакет загружается через административную панель.' },
  { badge: '6', title: 'Ready', text: 'CMS проверяет пакет, применяет миграции и возвращает сайт в рабочее состояние.' },
]

export function registerStructureWidgets() {
  registerWidget({
    type: 'connector-line',
    label: 'Линия-коннектор',
    category: 'basic',
    defaultSettings: {
      absolute: true,
      inset_left: '8%',
      inset_right: '8%',
      top: '1.5rem',
      thickness: '1px',
      color: 'rgba(255,255,255,0.1)',
    },
    settingsFields: fields(
      { key: 'absolute', label: 'Абсолютное позиционирование', type: 'toggle' },
      { key: 'inset_left', label: 'Отступ слева', type: 'text' },
      { key: 'inset_right', label: 'Отступ справа', type: 'text' },
      { key: 'top', label: 'Отступ сверху', type: 'text' },
      { key: 'thickness', label: 'Толщина', type: 'text' },
      { key: 'color', label: 'Цвет', type: 'color' },
    ),
    Render: ConnectorLineRender,
  })

  registerWidget({
    type: 'step-badge',
    label: 'Круг шага',
    category: 'basic',
    defaultSettings: { label: '1', filled: false, size: '3rem' },
    settingsFields: fields(
      { key: 'label', label: 'Текст / номер', type: 'text' },
      { key: 'filled', label: 'Заливка (active)', type: 'toggle' },
      { key: 'size', label: 'Размер', type: 'text' },
    ),
    Render: StepBadgeRender,
  })

  registerWidget({
    type: 'steps-row',
    label: 'Ряд шагов (пайплайн)',
    category: 'basic',
    defaultSettings: {
      animate: true,
      show_line: true,
      line_inset_left: '8%',
      line_inset_right: '8%',
      line_top: '1.5rem',
      items: DEFAULT_STEPS,
    },
    settingsFields: fields(
      { key: 'animate', label: 'Анимация заливки', type: 'toggle' },
      { key: 'show_line', label: 'Показывать линию', type: 'toggle' },
      { key: 'line_inset_left', label: 'Линия: отступ слева', type: 'text' },
      { key: 'line_inset_right', label: 'Линия: отступ справа', type: 'text' },
      { key: 'line_top', label: 'Линия: отступ сверху', type: 'text' },
      {
        key: 'items',
        label: 'Шаги',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Шаг"
            blank={() => ({ badge: '', title: '', text: '' })}
            fields={[
              { key: 'badge', label: 'Номер', kind: 'text' },
              { key: 'title', label: 'Имя', kind: 'text' },
              { key: 'text', label: 'Текст', kind: 'textarea' },
            ]}
          />
        ),
      },
    ),
    Render: StepsRowRender,
  })

  registerWidget({
    type: 'content-tabs',
    label: 'Вкладки с списками',
    category: 'landing',
    defaultSettings: {
      tabs: [
        { name: 'Система', items: 'Авторизация\nРоли и права\nМиграции\nОбновления\nЖурнал действий\nРезервные копии' },
        { name: 'Контент', items: 'Страницы\nPage Builder\nБлог\nПроекты\nМедиатека\nНавигация' },
        { name: 'Коммерция', items: 'Товары\nКаталог\nCheckout\nЗаказы\nСтраницы оплаты' },
        { name: 'Интеграции', items: 'Webhooks\nMail\nMCP\nRemote deploy' },
        { name: 'Продвижение', items: 'SEO\nSitemap\nRobots\nPrerender\nПользовательские CSS и JavaScript' },
      ],
    },
    settingsFields: fields(
      {
        key: 'tabs',
        label: 'Вкладки',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Вкладка"
            blank={() => ({ name: '', items: '' })}
            fields={[
              { key: 'name', label: 'Название', kind: 'text' },
              { key: 'items', label: 'Пункты (по строке)', kind: 'textarea' },
            ]}
          />
        ),
      },
    ),
    Render: ContentTabsRender,
  })
}