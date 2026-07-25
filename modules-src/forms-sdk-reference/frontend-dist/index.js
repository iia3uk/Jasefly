/**
 * Forms SDK Reference — hand-written ESM for Platform SDK certification.
 * Uses ctx.ui from host when available; no react/@/ imports.
 */

const SLUG = 'forms-sdk-reference'
const VERSION = '1.0.0'
const API = '/api/v1'

function authHeaders(extra = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'same-origin',
    ...opts,
    headers: authHeaders(opts.headers || {}),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* raw */
  }
  if (!res.ok) {
    const msg = json?.error || json?.message || text || res.statusText
    throw new Error(msg)
  }
  return json?.data ?? json
}

function uiKit(ctx) {
  if (ctx.ui?.createElement) return ctx.ui
  return null
}

function el(ui, type, props, ...children) {
  const flat = children.flat().filter((c) => c != null && c !== false)
  return ui.createElement(type, props, ...flat)
}

function FormsListPage({ ui }) {
  const { createElement: h, useState, useEffect, Fragment } = ui
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [formJson, setFormJson] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    apiFetch('/admin/forms-ref')
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const openEdit = (row) => {
    setEditing(row?.id ?? 'new')
    if (row?.id) {
      apiFetch(`/admin/forms-ref/${row.id}`)
        .then((f) => setFormJson(JSON.stringify(f, null, 2)))
        .catch((e) => setError(e.message))
    } else {
      setFormJson(JSON.stringify({
        name: 'Новая форма',
        slug: '',
        status: 'draft',
        success_message: 'Спасибо!',
        submit_button_text: 'Отправить',
        fields: [
          { name: 'name', label: 'Имя', type: 'text', required: true, sort_order: 10 },
          { name: 'email', label: 'Email', type: 'email', required: true, sort_order: 20 },
        ],
      }, null, 2))
    }
  }

  const save = () => {
    let payload
    try {
      payload = JSON.parse(formJson)
    } catch {
      setError('Невалидный JSON')
      return
    }
    const fields = payload.fields || []
    const body = { ...payload }
    delete body.fields
    const req = editing === 'new'
      ? apiFetch('/admin/forms-ref', { method: 'POST', body: JSON.stringify({ ...body, fields }) })
      : apiFetch(`/admin/forms-ref/${editing}`, { method: 'PUT', body: JSON.stringify({ ...body, fields }) })
    req.then(() => { setEditing(null); load() }).catch((e) => setError(e.message))
  }

  if (editing) {
    return h('div', { className: 'p-6 space-y-4 max-w-3xl' },
      h('h1', { className: 'text-xl font-semibold' }, editing === 'new' ? 'Создать форму' : `Редактировать #${editing}`),
      error ? h('p', { className: 'fsr-error' }, error) : null,
      h('textarea', {
        className: 'w-full h-96 font-mono text-xs rounded border border-white/10 bg-black/30 p-3',
        value: formJson,
        onChange: (e) => setFormJson(e.target.value),
      }),
      h('div', { className: 'flex gap-2' },
        h('button', { className: 'px-3 py-1 rounded bg-blue-600 text-white', onClick: save }, 'Сохранить'),
        h('button', { className: 'px-3 py-1 rounded border border-white/20', onClick: () => setEditing(null) }, 'Отмена'),
      ),
    )
  }

  return h('div', { className: 'p-6 space-y-4' },
    h('div', { className: 'flex items-center justify-between' },
      h('h1', { className: 'text-xl font-semibold' }, 'Forms SDK Reference'),
      h('button', { className: 'px-3 py-1 rounded bg-blue-600 text-white text-sm', onClick: () => openEdit(null) }, '+ Форма'),
    ),
    loading ? h('p', { className: 'fsr-muted' }, 'Загрузка…') : null,
    error ? h('p', { className: 'fsr-error' }, error) : null,
    !loading && !error && rows.length === 0 ? h('p', { className: 'fsr-muted' }, 'Нет форм') : null,
    rows.length > 0 ? h('table', { className: 'fsr-admin-table' },
      h('thead', null, h('tr', null,
        h('th', null, 'ID'), h('th', null, 'Название'), h('th', null, 'Slug'), h('th', null, 'Статус'), h('th', null, 'Заявки'), h('th', null, ''),
      )),
      h('tbody', null, rows.map((r) => h('tr', { key: r.id },
        h('td', null, r.id),
        h('td', null, r.name),
        h('td', null, r.slug),
        h('td', null, r.status),
        h('td', null, r.submissions_count ?? 0),
        h('td', null, h('button', { className: 'text-blue-400 text-sm', onClick: () => openEdit(r) }, 'Изменить')),
      ))),
    ) : null,
  )
}

function SubmissionsPage({ ui }) {
  const { createElement: h, useState, useEffect } = ui
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)

  const load = () => {
    setLoading(true)
    setError('')
    const q = status ? `?status=${encodeURIComponent(status)}` : ''
    apiFetch(`/admin/forms-ref-submissions${q}`)
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [status])

  const openDetail = (id) => {
    apiFetch(`/admin/forms-ref-submissions/${id}`)
      .then(setDetail)
      .catch((e) => setError(e.message))
  }

  return h('div', { className: 'p-6 space-y-4' },
    h('h1', { className: 'text-xl font-semibold' }, 'Заявки Forms SDK'),
    h('div', { className: 'flex gap-2 items-center' },
      h('label', { className: 'fsr-muted' }, 'Статус:'),
      h('select', {
        className: 'rounded border border-white/10 bg-black/30 px-2 py-1 text-sm',
        value: status,
        onChange: (e) => setStatus(e.target.value),
      },
        h('option', { value: '' }, 'Все'),
        ['new', 'in_progress', 'resolved', 'spam', 'archived'].map((s) => h('option', { key: s, value: s }, s)),
      ),
    ),
    loading ? h('p', { className: 'fsr-muted' }, 'Загрузка…') : null,
    error ? h('p', { className: 'fsr-error' }, error) : null,
    !loading && !error && rows.length === 0 ? h('p', { className: 'fsr-muted' }, 'Нет заявок') : null,
    rows.length > 0 ? h('table', { className: 'fsr-admin-table' },
      h('thead', null, h('tr', null,
        h('th', null, 'ID'), h('th', null, 'Форма'), h('th', null, 'Статус'), h('th', null, 'Дата'), h('th', null, ''),
      )),
      h('tbody', null, rows.map((r) => h('tr', { key: r.id },
        h('td', null, r.public_id || r.id),
        h('td', null, r.form_name || r.form_slug),
        h('td', null, r.status),
        h('td', null, r.created_at),
        h('td', null, h('button', { className: 'text-blue-400 text-sm', onClick: () => openDetail(r.id) }, 'Детали')),
      ))),
    ) : null,
    detail ? h('div', { className: 'rounded border border-white/10 p-4 space-y-2' },
      h('h2', { className: 'font-medium' }, `Заявка ${detail.public_id}`),
      h('pre', { className: 'text-xs overflow-auto' }, JSON.stringify(detail, null, 2)),
      h('button', { className: 'text-sm text-zinc-400', onClick: () => setDetail(null) }, 'Закрыть'),
    ) : null,
  )
}

function FormWidgetRender({ ui, settings, mode }) {
  const { createElement: h, useState, useEffect } = ui
  const slug = settings?.form_slug || 'sdk-demo'
  const title = settings?.title || ''
  const [form, setForm] = useState(null)
  const [values, setValues] = useState({})
  const [status, setStatus] = useState('idle')
  const [msg, setMsg] = useState('')
  const startedAt = useState(() => Date.now())[0]

  useEffect(() => {
    fetch(`${API}/forms-ref/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((j) => setForm(j.data))
      .catch(() => setForm(null))
  }, [slug])

  const submit = (e) => {
    e?.preventDefault?.()
    setStatus('loading')
    setMsg('')
    fetch(`${API}/forms-ref/${encodeURIComponent(slug)}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values,
        website: '',
        _hp: '',
        _started_at: startedAt,
        page_url: typeof location !== 'undefined' ? location.href : '',
      }),
    })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Ошибка')
        setStatus('ok')
        setMsg(j.data?.message || 'Отправлено')
        setValues({})
      })
      .catch((err) => { setStatus('err'); setMsg(err.message) })
  }

  if (!form) {
    return h('div', { className: 'fsr-widget fsr-muted' }, mode === 'edit' ? 'Виджет формы (preview)' : 'Загрузка формы…')
  }

  return h('form', { className: 'fsr-widget', onSubmit: submit },
    title ? h('h3', { className: 'text-lg font-medium mb-3' }, title) : null,
    form.description ? h('p', { className: 'fsr-muted mb-3' }, form.description) : null,
    (form.fields || []).map((f) => {
      if (['heading', 'paragraph'].includes(f.type)) {
        return f.type === 'heading'
          ? h('h4', { key: f.name, className: 'font-medium mt-2' }, f.label)
          : h('p', { key: f.name, className: 'fsr-muted' }, f.label)
      }
      const inputType = f.type === 'email' ? 'email' : f.type === 'textarea' ? undefined : 'text'
      const common = {
        key: f.name,
        name: f.name,
        placeholder: f.placeholder || '',
        required: !!f.required,
        value: values[f.name] ?? f.default_value ?? '',
        onChange: (e) => setValues((v) => ({ ...v, [f.name]: e.target.value })),
      }
      return h('div', { key: f.name },
        h('label', null, f.label, f.required ? ' *' : ''),
        f.type === 'textarea'
          ? h('textarea', { ...common, rows: 4 })
          : h('input', { ...common, type: inputType || 'text' }),
        f.help_text ? h('span', { className: 'fsr-muted' }, f.help_text) : null,
      )
    }),
    h('input', { type: 'text', name: 'website', tabIndex: -1, autoComplete: 'off', style: { display: 'none' }, value: '', readOnly: true }),
    h('button', { type: 'submit', disabled: status === 'loading' }, form.submit_button_text || 'Отправить'),
    status === 'ok' ? h('p', { className: 'fsr-success mt-2' }, msg) : null,
    status === 'err' ? h('p', { className: 'fsr-error mt-2' }, msg) : null,
  )
}

const moduleExport = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,

  async register(ctx) {
    const ui = uiKit(ctx)
    const navForms = {
      group: 'Контент',
      path: '/admin/forms-sdk-reference',
      label: 'Forms SDK',
      permission: 'forms-ref.view',
      icon: 'layout-template',
    }
    const navSubs = {
      group: 'Контент',
      path: '/admin/forms-sdk-reference/submissions',
      label: 'Заявки SDK Forms',
      permission: 'forms-ref.submissions.view',
      icon: 'mail',
    }

    const pageForms = {
      path: 'forms-sdk-reference',
      label: 'Forms SDK Reference',
      group: 'Контент',
      permission: 'forms-ref.view',
      ...(ui ? { Component: () => el(ui, FormsListPage, { ui }) } : {}),
    }
    const pageSubs = {
      path: 'forms-sdk-reference/submissions',
      label: 'Заявки SDK Forms',
      group: 'Контент',
      permission: 'forms-ref.submissions.view',
      ...(ui ? { Component: () => el(ui, SubmissionsPage, { ui }) } : {}),
    }

    if (ctx.admin?.registerNavItem) {
      ctx.admin.registerNavItem(navForms)
      ctx.admin.registerNavItem(navSubs)
      ctx.admin.registerPage(pageForms)
      ctx.admin.registerPage(pageSubs)
    } else {
      ctx.registerAdminNavItem?.(navForms)
      ctx.registerAdminNavItem?.(navSubs)
      ctx.registerAdminRoute?.(pageForms)
      ctx.registerAdminRoute?.(pageSubs)
    }

    if (ctx.builder?.registerWidget && ui) {
      ctx.builder.registerWidget({
        type: 'form',
        label: 'Форма (SDK Ref)',
        category: 'basic',
        icon: 'layout-template',
        defaultSettings: { form_slug: 'sdk-demo', title: '', layout: 'stack' },
        settingsFields: [
          { key: 'form_slug', label: 'Slug формы', type: 'text' },
          { key: 'title', label: 'Заголовок', type: 'text' },
          { key: 'layout', label: 'Layout', type: 'select', options: ['stack', 'grid'] },
        ],
        Render: ({ settings, mode }) => el(ui, FormWidgetRender, { ui, settings, mode }),
      })
    }
  },

  async unregister() {
    /* host gates widgets/pages by plugin enable */
  },
}

export default moduleExport
