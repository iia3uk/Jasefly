import clsx from 'clsx'
import { Link } from 'react-router-dom'
import type { CSSProperties, ElementType, FocusEvent, FormEvent, MouseEvent, ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { useBuilderEdit } from '@/builder/context/BuilderEditContext'
import { fieldAlignClass, readFieldStyles, stylesToCss } from '@/builder/edit/StyleFields'

type EditableShellProps = {
  field: string
  label: string
  className?: string
  style?: CSSProperties
  children: ReactNode
  block?: boolean
}

/** Click target + selection ring for a sub-part of a widget. */
export function EditableShell({ field, label, className, style, children, block }: EditableShellProps) {
  const ctx = useBuilderEdit()
  if (!ctx?.editMode) {
    return block ? <div className={className} style={style}>{children}</div> : <>{children}</>
  }

  const selected = ctx.selectedId === ctx.elementId && ctx.selectedPart === field
  const fieldStyles = readFieldStyles(ctx.settings, field)
  const alignCls = fieldAlignClass(fieldStyles)

  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ctx.onSelectElement(ctx.elementId, { part: field })
  }

  return (
    <span
      data-builder-editable
      data-field={field}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(e as unknown as MouseEvent)
        }
      }}
      className={clsx(
        'relative rounded-sm transition',
        // w-fit so flex items-center / mx-auto can center like the public site
        block ? 'block w-fit max-w-full' : 'inline-block max-w-full',
        alignCls,
        selected
          ? 'ring-2 ring-[var(--accent,#8eb6ff)] ring-offset-2 ring-offset-[var(--background,#0a0a0b)]'
          : 'hover:ring-1 hover:ring-white/35',
        className,
      )}
      style={style}
    >
      {selected && (
        <span className="pointer-events-none absolute -top-5 left-0 z-20 whitespace-nowrap rounded bg-[var(--accent,#8eb6ff)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black [color:#000] [-webkit-text-fill-color:#000]">
          {label}
        </span>
      )}
      {children}
    </span>
  )
}

type EditableTextProps = {
  field: string
  label: string
  value: string
  className?: string
  style?: CSSProperties
  as?: ElementType
  multiline?: boolean
  placeholder?: string
}

export function EditableText({
  field,
  label,
  value,
  className,
  style,
  as: Tag = 'span',
  multiline = false,
  placeholder,
}: EditableTextProps) {
  const ctx = useBuilderEdit()
  const ref = useRef<HTMLElement | null>(null)
  const hint = placeholder || label
  const fieldCss = stylesToCss(readFieldStyles(ctx?.settings, field))
  const mergedStyle = { ...style, ...fieldCss }
  const tagName = typeof Tag === 'string' ? Tag : 'span'

  // Keep contentEditable DOM in sync — must re-run when the tag remounts (h1↔h2).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ctx?.editMode) return
    if (document.activeElement === el) return
    const current = el.textContent ?? ''
    if (current !== value) {
      el.textContent = value
    }
  }, [value, ctx?.editMode, tagName])

  if (!ctx?.editMode) {
    // Placeholders are builder-only hints — never render them as public copy.
    if (!value) return null
    const pubStyles = readFieldStyles(ctx?.settings, field)
    return (
      <Tag
        className={clsx(className, fieldAlignClass(pubStyles))}
        style={{ ...style, ...stylesToCss(pubStyles) }}
      >
        {value}
      </Tag>
    )
  }

  const isBlock = multiline || tagName === 'p' || tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4' || tagName === 'div'

  return (
    <EditableShell field={field} label={label} block={isBlock}>
      <span className={clsx('relative max-w-full', isBlock ? 'block w-fit max-w-full' : 'inline-block')}>
        {!value && (
          <span
            className="pointer-events-none absolute left-0 top-0 text-white/35"
            aria-hidden
          >
            {hint}
          </span>
        )}
        <Tag
          key={tagName}
          ref={ref as never}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={hint}
          className={clsx('relative outline-none', className, !value && 'min-w-[3ch]')}
          style={mergedStyle}
          onBlur={(e: FocusEvent<HTMLElement>) => {
            const next = e.currentTarget.textContent?.trim() ?? ''
            if (next !== value) ctx.onPatch({ [field]: next })
          }}
          onInput={(e: FormEvent<HTMLElement>) => e.stopPropagation()}
          onMouseDown={(e: MouseEvent<HTMLElement>) => {
            // Open inspector on press; do not preventDefault so caret still lands in text
            e.stopPropagation()
            ctx.onSelectElement(ctx.elementId, { part: field })
          }}
          onClick={(e: MouseEvent<HTMLElement>) => {
            e.stopPropagation()
            ctx.onSelectElement(ctx.elementId, { part: field })
          }}
        />
      </span>
    </EditableShell>
  )
}

type EditableButtonProps = {
  labelField: string
  hrefField: string
  label: string
  href: string
  variant?: 'solid' | 'ghost'
  className?: string
  style?: CSSProperties
}

export function EditableButton({
  labelField,
  hrefField,
  label,
  href,
  variant = 'solid',
  className,
  style,
}: EditableButtonProps) {
  const ctx = useBuilderEdit()
  const btnClass = variant === 'ghost' ? 'button button-ghost' : 'button'
  const fieldCss = { ...stylesToCss(readFieldStyles(ctx?.settings, labelField)), ...style }
  const alignCls = fieldAlignClass(readFieldStyles(ctx?.settings, labelField))

  if (!ctx?.editMode) {
    if (!label) return null
    if (href && href !== '#') {
      const external = href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')
      if (external) {
        return <a className={clsx(btnClass, className, alignCls)} href={href} style={fieldCss}>{label}</a>
      }
      return <Link className={clsx(btnClass, className, alignCls)} to={href} style={fieldCss}>{label}</Link>
    }
    return <span className={clsx(btnClass, className, alignCls)} style={fieldCss}>{label}</span>
  }

  if (!label && !href) return null

  // Match public layout: inline CTA side-by-side — no under-button href chrome.
  return (
    <EditableShell
      field={labelField}
      label={href ? `Кнопка · ${href}` : 'Кнопка'}
      className={clsx('shrink-0 max-sm:w-full', alignCls)}
    >
      <span
        className={clsx(btnClass, className, 'pointer-events-none select-none')}
        style={fieldCss}
        aria-hidden
        onDoubleClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          ctx.onSelectElement(ctx.elementId, { part: hrefField })
        }}
      >
        {label || 'Кнопка'}
      </span>
    </EditableShell>
  )
}

/** Prevents links/forms inside canvas from firing while editing — without blocking widget selection. */
export function EditCanvasGuard({ children, enabled }: { children: ReactNode; enabled?: boolean }) {
  if (!enabled) return <>{children}</>

  return (
    <div
      className="builder-edit-canvas"
      onClickCapture={(e) => {
        const t = e.target as HTMLElement
        if (t.closest('[data-builder-editable]')) return

        if (t.closest('[data-builder-id]')) {
          const link = t.closest('a[href]')
          if (link) e.preventDefault()
          const btn = t.closest('button')
          if (btn && !btn.hasAttribute('data-builder-id')) e.preventDefault()
          if (t.closest('input, textarea, select')) e.preventDefault()
          return
        }

        const interactive = t.closest('a, button, input, textarea, select, form')
        if (interactive) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onSubmitCapture={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {children}
    </div>
  )
}
