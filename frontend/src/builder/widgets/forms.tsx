import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { api, ApiRequestError } from '@/lib/api'

type PublicField = {
  name: string
  label: string
  type: string
  placeholder?: string | null
  help_text?: string | null
  default_value?: string | null
  required?: boolean
  options?: Array<{ value: string; label: string }> | string[] | null
  width?: string
}

type PublicForm = {
  id: number
  name: string
  slug: string
  description?: string | null
  success_message?: string | null
  submit_button_text?: string | null
  fields: PublicField[]
}

function fields(...items: SettingsField[]) {
  return items
}

function normalizeOptions(raw: PublicField['options']): Array<{ value: string; label: string }> {
  if (!raw) return []
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
    return raw.map((v) => ({ value: v, label: v }))
  }
  return (raw as Array<{ value: string; label: string }>).filter((o) => o && o.value)
}

function FormWidgetRender({
  settings = {},
  editMode,
}: {
  settings?: Record<string, unknown>
  editMode?: boolean
}) {
  const slug = String(settings.form_slug || settings.slug || '').trim()
  const layout = String(settings.layout || 'stacked')
  const title = String(settings.title || '')
  const startedAtRef = useRef(Date.now())
  const [form, setForm] = useState<PublicForm | null>(null)
  const [loadError, setLoadError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    startedAtRef.current = Date.now()
  }, [slug])

  useEffect(() => {
    if (!slug) {
      setForm(null)
      setLoadError('')
      return
    }
    let cancelled = false
    void api.get<{ data: PublicForm }>(`/forms/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (cancelled) return
        const data = (res as { data?: PublicForm })?.data ?? null
        setForm(data)
        setLoadError(data ? '' : 'Форма не найдена')
      })
      .catch((err) => {
        if (cancelled) return
        setForm(null)
        setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить форму')
      })
    return () => { cancelled = true }
  }, [slug])

  const gridClass = useMemo(() => {
    if (layout === 'grid') return 'grid gap-3 sm:grid-cols-2'
    if (layout === 'inline') return 'flex flex-wrap items-end gap-3'
    return 'space-y-3'
  }, [layout])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!slug || !form) return
    const fd = new FormData(e.currentTarget)
    if (fd.get('website') || fd.get('_hp')) return

    const values: Record<string, string> = {}
    for (const field of form.fields) {
      if (['heading', 'paragraph'].includes(field.type)) continue
      if (field.type === 'checkbox') {
        values[field.name] = fd.get(field.name) ? '1' : ''
      } else {
        values[field.name] = String(fd.get(field.name) ?? '')
      }
    }

    setPending(true)
    setStatus('')
    setFieldErrors({})
    try {
      const res = await api.post<{ data?: { message?: string; redirect_url?: string | null } }>(
        `/forms/${encodeURIComponent(slug)}/submit`,
        {
          values,
          page_url: typeof window !== 'undefined' ? window.location.href : '',
          website: '',
          _hp: '',
          _started_at: startedAtRef.current,
        },
      )
      const data = (res as { data?: { message?: string; redirect_url?: string | null } })?.data
      const message = data?.message || form.success_message || 'Спасибо!'
      setStatus(message)
      e.currentTarget.reset()
      startedAtRef.current = Date.now()
      if (data?.redirect_url) {
        window.location.href = data.redirect_url
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const raw = err.details.raw as { errors?: Record<string, string> } | undefined
        if (raw?.errors) setFieldErrors(raw.errors)
      }
      setStatus(err instanceof Error ? err.message : 'Не удалось отправить')
    } finally {
      setPending(false)
    }
  }

  if (editMode && !slug) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-white/15 px-4 py-8 text-center text-sm text-[var(--muted)]">
        Укажите slug формы в настройках виджета
      </div>
    )
  }

  if (!slug) {
    return null
  }

  if (loadError && !form) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-red-500/30 px-4 py-6 text-center text-sm text-red-300">
        {loadError}
      </div>
    )
  }

  if (!form) {
    return <div className="text-sm text-[var(--muted)]">Загрузка формы…</div>
  }

  const heading = title || form.name

  return (
    <div className="mx-auto w-full max-w-xl">
      {heading ? <h2 className="font-heading mb-2 text-2xl">{heading}</h2> : null}
      {form.description ? <p className="mb-4 text-sm text-[var(--muted)]">{form.description}</p> : null}
      <form className={gridClass} onSubmit={onSubmit} noValidate>
        <input name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
        <input name="_hp" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
        {form.fields.map((field) => {
          if (field.type === 'heading') {
            return <h3 key={field.name} className="font-heading text-lg sm:col-span-2">{field.label}</h3>
          }
          if (field.type === 'paragraph') {
            return <p key={field.name} className="text-sm text-[var(--muted)] sm:col-span-2">{field.label}</p>
          }

          const half = field.width === 'half'
          const err = fieldErrors[field.name]
          const common = 'w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2'

          if (field.type === 'textarea') {
            return (
              <label key={field.name} className={clsx('block space-y-1 text-sm', half && layout === 'grid' && 'sm:col-span-1')}>
                <span>{field.label}{field.required ? ' *' : ''}</span>
                <textarea
                  name={field.name}
                  required={Boolean(field.required)}
                  placeholder={field.placeholder || undefined}
                  defaultValue={field.default_value || undefined}
                  rows={4}
                  className={common}
                />
                {field.help_text ? <span className="text-xs text-[var(--muted)]">{field.help_text}</span> : null}
                {err ? <span className="text-xs text-red-400">{err}</span> : null}
              </label>
            )
          }

          if (field.type === 'select') {
            const opts = normalizeOptions(field.options)
            return (
              <label key={field.name} className={clsx('block space-y-1 text-sm', half && layout === 'grid' && 'sm:col-span-1')}>
                <span>{field.label}{field.required ? ' *' : ''}</span>
                <select name={field.name} required={Boolean(field.required)} className={common} defaultValue={field.default_value || ''}>
                  <option value="">—</option>
                  {opts.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {err ? <span className="text-xs text-red-400">{err}</span> : null}
              </label>
            )
          }

          if (field.type === 'checkbox') {
            return (
              <label key={field.name} className={clsx('flex items-center gap-2 text-sm', half && layout === 'grid' && 'sm:col-span-1')}>
                <input type="checkbox" name={field.name} defaultChecked={field.default_value === '1'} />
                <span>{field.label}</span>
                {err ? <span className="text-xs text-red-400">{err}</span> : null}
              </label>
            )
          }

          return (
            <label key={field.name} className={clsx('block space-y-1 text-sm', half && layout === 'grid' && 'sm:col-span-1')}>
              <span>{field.label}{field.required ? ' *' : ''}</span>
              <input
                name={field.name}
                type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : field.type === 'phone' ? 'tel' : 'text'}
                required={Boolean(field.required)}
                placeholder={field.placeholder || undefined}
                defaultValue={field.default_value || undefined}
                className={common}
              />
              {field.help_text ? <span className="text-xs text-[var(--muted)]">{field.help_text}</span> : null}
              {err ? <span className="text-xs text-red-400">{err}</span> : null}
            </label>
          )
        })}
        <div className={clsx(layout === 'grid' && 'sm:col-span-2', layout === 'inline' && 'w-full sm:w-auto')}>
          <button type="submit" disabled={pending} className="button w-full sm:w-auto">
            {pending ? 'Отправка…' : (form.submit_button_text || 'Отправить')}
          </button>
        </div>
        {fieldErrors._form ? <p className="text-sm text-red-400 sm:col-span-2">{fieldErrors._form}</p> : null}
        {status ? <p className="text-sm text-[var(--muted)] sm:col-span-2">{status}</p> : null}
      </form>
    </div>
  )
}

export function registerFormWidgets() {
  registerWidget({
    type: 'form',
    label: 'Форма',
    category: 'basic',
    plugin: 'forms',
    defaultSettings: {
      form_slug: 'contact',
      form_id: '',
      title: '',
      layout: 'stacked',
    },
    settingsFields: fields(
      { key: 'form_slug', label: 'Slug формы', type: 'text' },
      { key: 'form_id', label: 'ID формы (опц.)', type: 'number' },
      { key: 'title', label: 'Заголовок (перекрыть)', type: 'text' },
      {
        key: 'layout',
        label: 'Layout',
        type: 'select',
        options: [
          { value: 'stacked', label: 'Столбик' },
          { value: 'grid', label: 'Сетка 2 col' },
          { value: 'inline', label: 'Inline' },
        ],
      },
    ),
    Render: FormWidgetRender,
  })
}
