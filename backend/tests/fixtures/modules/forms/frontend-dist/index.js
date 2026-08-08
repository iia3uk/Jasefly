/**
 * Forms package FE — host-bound admin pages + frozen builder widget `form`.
 */
const SLUG = 'forms'
const VERSION = '1.0.0'
const API = '/api/v1'

const css = {
  widget: { margin: '0 auto', maxWidth: 576, width: '100%' },
  heading: { fontFamily: 'var(--font-heading, inherit)', margin: '0 0 8px', fontSize: 24 },
  desc: { margin: '0 0 16px', fontSize: 14, color: 'var(--muted, #a1a1aa)' },
  field: { display: 'block', marginBottom: 12, fontSize: 14 },
  label: { display: 'block', marginBottom: 4 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border, #3f3f46)',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
  },
  err: { fontSize: 12, color: '#f87171', marginTop: 4 },
  help: { fontSize: 12, color: 'var(--muted, #71717a)', marginTop: 4 },
  btn: {
    display: 'inline-block',
    padding: '10px 18px',
    borderRadius: 8,
    border: '1px solid var(--border, #3f3f46)',
    background: 'var(--primary, #0369a1)',
    color: '#fff',
    cursor: 'pointer',
    font: 'inherit',
  },
  status: { fontSize: 14, color: 'var(--muted, #a1a1aa)', marginTop: 12 },
  dashed: {
    borderRadius: 8,
    border: '1px dashed rgba(255,255,255,.15)',
    padding: '32px 16px',
    textAlign: 'center',
    fontSize: 14,
    color: 'var(--muted, #a1a1aa)',
  },
  loadErr: {
    borderRadius: 8,
    border: '1px dashed rgba(248,113,113,.3)',
    padding: '24px 16px',
    textAlign: 'center',
    fontSize: 14,
    color: '#fca5a5',
  },
}

function normalizeOptions(raw) {
  if (!raw) return []
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
    return raw.map((v) => ({ value: v, label: v }))
  }
  return (raw || []).filter((o) => o && o.value)
}

function layoutStyle(layout) {
  if (layout === 'grid') return { display: 'grid', gap: 12, gridTemplateColumns: '1fr', }
  if (layout === 'inline') return { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }
  return { display: 'flex', flexDirection: 'column', gap: 12 }
}

function registerHostAdminPage(ctx, spec) {
  const { path, label, group, permission, hostPageKey, icon } = spec
  const nav = {
    group,
    path: `/admin/${path}`,
    label,
    permission,
    icon,
  }
  const Comp = ctx.admin?.resolveHostPage?.(hostPageKey)
  const page = {
    path,
    label,
    group,
    permission,
    hostPageKey,
    ...(Comp ? { Component: Comp } : {}),
  }
  if (ctx.admin?.registerNavItem) {
    ctx.admin.registerNavItem(nav)
    ctx.admin.registerPage?.(page)
  } else {
    ctx.registerAdminNavItem?.(nav)
    ctx.registerAdminRoute?.(page)
  }
}

function formWidgetDef(ui) {
  const { createElement: h, useState, useEffect, useRef, useMemo } = ui

  function FormWidgetRender({ settings = {}, editMode }) {
    const slug = String(settings.form_slug || settings.slug || '').trim()
    const layout = String(settings.layout || 'stacked')
    const title = String(settings.title || '')
    const startedAtRef = useRef(Date.now())
    const [form, setForm] = useState(null)
    const [loadError, setLoadError] = useState('')
    const [fieldErrors, setFieldErrors] = useState({})
    const [status, setStatus] = useState('')
    const [pending, setPending] = useState(false)

    useEffect(() => {
      startedAtRef.current = Date.now()
    }, [slug])

    useEffect(() => {
      if (!slug) {
        setForm(null)
        setLoadError('')
        return undefined
      }
      let cancelled = false
      fetch(`${API}/forms/${encodeURIComponent(slug)}`, { credentials: 'same-origin' })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}))
          if (cancelled) return
          const data = json?.data ?? null
          setForm(data)
          setLoadError(data ? '' : (json?.error || 'Форма не найдена'))
        })
        .catch((err) => {
          if (cancelled) return
          setForm(null)
          setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить форму')
        })
      return () => { cancelled = true }
    }, [slug])

    const formStyle = useMemo(() => layoutStyle(layout), [layout])

    const onSubmit = (event) => {
      event.preventDefault()
      if (!slug || !form || editMode) return
      const fd = new FormData(event.currentTarget)
      if (fd.get('website') || fd.get('_hp')) return

      const values = {}
      for (const field of form.fields || []) {
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
      fetch(`${API}/forms/${encodeURIComponent(slug)}/submit`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values,
          page_url: typeof window !== 'undefined' ? window.location.href : '',
          website: '',
          _hp: '',
          _started_at: startedAtRef.current,
        }),
      })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}))
          if (!res.ok) {
            if (json.errors) setFieldErrors(json.errors)
            throw new Error(json.error || json.message || res.statusText)
          }
          const data = json?.data
          const message = data?.message || form.success_message || 'Спасибо!'
          setStatus(message)
          event.currentTarget.reset()
          startedAtRef.current = Date.now()
          if (data?.redirect_url && typeof window !== 'undefined') {
            window.location.href = data.redirect_url
          }
        })
        .catch((err) => {
          setStatus(err instanceof Error ? err.message : 'Не удалось отправить')
        })
        .finally(() => setPending(false))
    }

    if (editMode && !slug) {
      return h('div', { style: css.dashed }, 'Укажите slug формы в настройках виджета')
    }
    if (!slug) return null
    if (loadError && !form) {
      return h('div', { style: css.loadErr }, loadError)
    }
    if (!form) {
      return h('div', { style: css.status }, 'Загрузка формы…')
    }

    const heading = title || form.name

    return h('div', { style: css.widget },
      heading ? h('h2', { style: css.heading }, heading) : null,
      form.description ? h('p', { style: css.desc }, form.description) : null,
      h('form', { style: formStyle, onSubmit, noValidate: true },
        h('input', { name: 'website', style: { display: 'none' }, tabIndex: -1, autoComplete: 'off', 'aria-hidden': true }),
        h('input', { name: '_hp', style: { display: 'none' }, tabIndex: -1, autoComplete: 'off', 'aria-hidden': true }),
        ...(form.fields || []).map((field) => {
          if (field.type === 'heading') {
            return h('h3', { key: field.name, style: { ...css.heading, fontSize: 18 } }, field.label)
          }
          if (field.type === 'paragraph') {
            return h('p', { key: field.name, style: css.desc }, field.label)
          }

          const err = fieldErrors[field.name]
          const half = field.width === 'half'

          if (field.type === 'textarea') {
            return h('label', { key: field.name, style: { ...css.field, ...(half && layout === 'grid' ? { gridColumn: 'span 1' } : {}) } },
              h('span', { style: css.label }, `${field.label}${field.required ? ' *' : ''}`),
              h('textarea', {
                name: field.name,
                required: Boolean(field.required),
                placeholder: field.placeholder || undefined,
                defaultValue: field.default_value || undefined,
                rows: 4,
                style: css.input,
              }),
              field.help_text ? h('span', { style: css.help }, field.help_text) : null,
              err ? h('span', { style: css.err }, err) : null,
            )
          }

          if (field.type === 'select') {
            const opts = normalizeOptions(field.options)
            return h('label', { key: field.name, style: css.field },
              h('span', { style: css.label }, `${field.label}${field.required ? ' *' : ''}`),
              h('select', {
                name: field.name,
                required: Boolean(field.required),
                defaultValue: field.default_value || '',
                style: css.input,
              },
                h('option', { value: '' }, '—'),
                ...opts.map((o) => h('option', { key: o.value, value: o.value }, o.label)),
              ),
              err ? h('span', { style: css.err }, err) : null,
            )
          }

          if (field.type === 'checkbox') {
            return h('label', {
              key: field.name,
              style: { ...css.field, display: 'flex', alignItems: 'center', gap: 8 },
            },
              h('input', {
                type: 'checkbox',
                name: field.name,
                defaultChecked: field.default_value === '1',
              }),
              h('span', null, field.label),
              err ? h('span', { style: css.err }, err) : null,
            )
          }

          const inputType = field.type === 'email' ? 'email'
            : field.type === 'number' ? 'number'
              : field.type === 'phone' ? 'tel'
                : 'text'

          return h('label', { key: field.name, style: css.field },
            h('span', { style: css.label }, `${field.label}${field.required ? ' *' : ''}`),
            h('input', {
              name: field.name,
              type: inputType,
              required: Boolean(field.required),
              placeholder: field.placeholder || undefined,
              defaultValue: field.default_value || undefined,
              style: css.input,
            }),
            field.help_text ? h('span', { style: css.help }, field.help_text) : null,
            err ? h('span', { style: css.err }, err) : null,
          )
        }),
        h('div', null,
          h('button', { type: 'submit', disabled: pending, style: css.btn },
            pending ? 'Отправка…' : (form.submit_button_text || 'Отправить'),
          ),
        ),
        fieldErrors._form ? h('p', { style: css.err }, fieldErrors._form) : null,
        status ? h('p', { style: css.status }, status) : null,
      ),
    )
  }

  return {
    type: 'form',
    label: 'Форма',
    category: 'basic',
    stableType: true,
    defaultSettings: {
      form_slug: 'contact',
      form_id: '',
      title: '',
      layout: 'stacked',
    },
    settingsFields: [
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
    ],
    Render: (props) => h(FormWidgetRender, { settings: props.settings || {}, editMode: props.editMode }),
  }
}

export const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,
  async register(ctx) {
    const ui = ctx.ui
    if (!ui?.createElement) {
      console.warn('[forms] ctx.ui missing')
      return
    }

    registerHostAdminPage(ctx, {
      path: 'forms',
      label: 'Формы',
      group: 'Контент',
      permission: 'forms.view',
      hostPageKey: 'forms.admin',
      icon: 'layout-template',
    })
    registerHostAdminPage(ctx, {
      path: 'form-submissions',
      label: 'Заявки форм',
      group: 'Контент',
      permission: 'forms.submissions.view',
      hostPageKey: 'forms.submissions',
      icon: 'mail',
    })

    const widget = formWidgetDef(ui)
    if (ctx.builder?.registerWidget) ctx.builder.registerWidget(widget)
    else ctx.registerBuilderWidget?.(widget)
  },
  async unregister() {},
}

export default JaseflyFrontendModule
