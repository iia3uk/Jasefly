/**
 * Comments package FE — admin moderation + frozen builder widgets.
 * Widget IDs stay: comments, reviews, rating-summary, review-form (stableType).
 */
const SLUG = 'comments'
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
  try { json = JSON.parse(text) } catch { /* */ }
  if (!res.ok) throw new Error(json?.error || json?.message || text || res.statusText)
  return json?.data ?? json
}

const css = {
  page: { maxWidth: 960, color: '#e4e4e7', paddingBottom: 40 },
  title: { margin: '0 0 8px', fontSize: 24, fontWeight: 650, color: '#fafafa' },
  hint: { margin: '0 0 16px', fontSize: 14, color: '#a1a1aa' },
  row: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  select: {
    padding: '8px 10px', borderRadius: 10, border: '1px solid #3f3f46',
    background: '#09090b', color: '#fafafa', font: 'inherit',
  },
  panel: {
    border: '1px solid #27272a', borderRadius: 16, background: 'rgba(24,24,27,.55)',
    padding: 16, marginBottom: 12,
  },
  btn: (primary) => ({
    padding: '8px 12px', borderRadius: 10, cursor: 'pointer', font: 'inherit', fontSize: 13,
    border: primary ? '1px solid rgba(56,189,248,.4)' : '1px solid #3f3f46',
    background: primary ? '#0369a1' : 'transparent',
    color: primary ? '#e0f2fe' : '#e4e4e7',
  }),
  muted: { color: '#71717a', fontSize: 12 },
  widget: { margin: '0 auto', maxWidth: 720 },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
    border: '1px solid var(--border, #3f3f46)', background: 'transparent', color: 'inherit', font: 'inherit',
  },
}

function AdminApp({ ui }) {
  const { createElement: h, useState, useEffect } = ui
  const [status, setStatus] = useState('pending')
  const [type, setType] = useState('')
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => {
    setError('')
    const q = new URLSearchParams({ status })
    if (type) q.set('type', type)
    return apiFetch(`/admin/comments?${q}`)
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
  }

  useEffect(() => { reload() }, [status, type])

  const moderate = (id, value) => {
    setBusy(true)
    apiFetch(`/admin/comments/${id}/moderate`, {
      method: 'POST',
      body: JSON.stringify({ status: value }),
    })
      .then(() => reload())
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  return h('div', { style: css.page },
    h('h1', { style: css.title }, 'Комментарии и отзывы'),
    h('p', { style: css.hint }, 'Очередь модерации пользовательского контента.'),
    error ? h('p', { style: { color: '#fca5a5' } }, error) : null,
    h('div', { style: css.row },
      h('select', {
        style: css.select, value: status,
        onChange: (e) => setStatus(e.target.value),
      }, ['pending', 'approved', 'rejected', 'spam'].map((s) => h('option', { key: s, value: s }, s))),
      h('select', {
        style: css.select, value: type,
        onChange: (e) => setType(e.target.value),
      },
        h('option', { value: '' }, 'Все типы'),
        h('option', { value: 'comment' }, 'Комментарии'),
        h('option', { value: 'review' }, 'Отзывы'),
      ),
    ),
    !rows.length
      ? h('div', { style: css.panel }, h('p', { style: css.muted }, 'Очередь пуста'))
      : rows.map((row) => h('div', { key: String(row.id), style: css.panel },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 } },
          h('div', null,
            h('strong', null, row.author_name),
            h('span', { style: { ...css.muted, marginLeft: 8 } }, `${row.target_type} #${row.target_id}`),
            row.verified_purchase ? h('span', { style: { marginLeft: 8, color: '#6ee7b7', fontSize: 12 } }, 'Покупка подтверждена') : null,
          ),
          h('span', null, `${row.type}${row.rating ? ` · ${row.rating}/5` : ''}`),
        ),
        h('p', { style: { whiteSpace: 'pre-wrap', margin: '12px 0' } }, row.body),
        h('div', { style: css.row },
          h('button', { type: 'button', style: css.btn(true), disabled: busy, onClick: () => moderate(row.id, 'approved') }, 'Одобрить'),
          h('button', { type: 'button', style: css.btn(false), disabled: busy, onClick: () => moderate(row.id, 'rejected') }, 'Отклонить'),
          h('button', { type: 'button', style: css.btn(false), disabled: busy, onClick: () => moderate(row.id, 'spam') }, 'Спам'),
          h('span', { style: { ...css.muted, marginLeft: 'auto' } }, row.created_at),
        ),
      )),
  )
}

const fields = [
  { key: 'title', label: 'Заголовок', type: 'text' },
  { key: 'target_type', label: 'Тип объекта', type: 'text' },
  { key: 'target_id', label: 'ID объекта', type: 'number' },
]

function widgetDefs(ui) {
  const { createElement: h, useState, useEffect } = ui

  function CommentListWidget({ settings = {}, editMode, listType = 'comment' }) {
    const [data, setData] = useState({ items: [], rating: { count: 0, average: 0, distribution: {} } })
    const targetType = String(settings.target_type || 'page')
    const targetId = Number(settings.target_id || 0)
    useEffect(() => {
      if (!targetId) return
      const q = new URLSearchParams({ target_type: targetType, target_id: String(targetId) })
      if (listType) q.set('type', listType)
      fetch(`${API}/comments?${q}`, { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((j) => setData(j?.data || { items: [], rating: { count: 0, average: 0, distribution: {} } }))
        .catch(() => setData({ items: [], rating: { count: 0, average: 0, distribution: {} } }))
    }, [targetId, targetType, listType])
    return h('section', { style: css.widget },
      h('h2', { style: { fontSize: 22, margin: 0 } }, String(settings.title || (listType === 'review' ? 'Отзывы' : 'Комментарии'))),
      !data.items.length ? h('p', { style: { ...css.muted, marginTop: 12 } }, 'Пока нет публикаций.') : null,
      h('div', { style: { marginTop: 16, display: 'grid', gap: 12 } },
        data.items.map((row) => h('article', {
          key: String(row.id),
          style: { border: '1px solid var(--border, #27272a)', borderRadius: 12, padding: 16 },
        },
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
            h('strong', null, row.author_name),
            row.rating ? h('span', null, '★'.repeat(row.rating) + '☆'.repeat(5 - row.rating)) : null,
            row.verified_purchase ? h('span', { style: { fontSize: 12, color: '#10b981' } }, 'Покупка подтверждена') : null,
          ),
          h('p', { style: { whiteSpace: 'pre-wrap', margin: '8px 0' } }, row.body),
          h('time', { style: css.muted }, row.created_at),
        )),
      ),
    )
  }

  function RatingSummaryWidget({ settings = {} }) {
    const [rating, setRating] = useState({ count: 0, average: 0 })
    const targetType = String(settings.target_type || 'product')
    const targetId = Number(settings.target_id || 0)
    useEffect(() => {
      if (!targetId) return
      const q = new URLSearchParams({ target_type: targetType, target_id: String(targetId), type: 'review' })
      fetch(`${API}/comments?${q}`, { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((j) => setRating(j?.data?.rating || { count: 0, average: 0 }))
        .catch(() => setRating({ count: 0, average: 0 }))
    }, [targetId, targetType])
    return h('div', {
      style: {
        ...css.widget, maxWidth: 360, textAlign: 'center',
        border: '1px solid var(--border, #27272a)', borderRadius: 12, padding: 20,
      },
    },
      h('div', { style: { fontSize: 36, fontWeight: 650 } }, Number(rating.average || 0).toFixed(1)),
      h('div', { style: { color: '#fbbf24', fontSize: 20 } }, '★★★★★'),
      h('p', { style: css.muted }, `${rating.count || 0} отзывов`),
    )
  }

  function ReviewFormWidget({ settings = {}, editMode }) {
    const [status, setStatus] = useState('')
    const [pending, setPending] = useState(false)
    const onSubmit = (event) => {
      event.preventDefault()
      if (editMode) return
      const form = new FormData(event.currentTarget)
      setPending(true)
      setStatus('')
      fetch(`${API}/comments`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'review',
          target_type: String(settings.target_type || 'product'),
          target_id: Number(settings.target_id || 0),
          author_name: String(form.get('name') || ''),
          author_email: String(form.get('email') || ''),
          rating: Number(form.get('rating') || 5),
          body: String(form.get('body') || ''),
        }),
      })
        .then(async (res) => {
          const j = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(j.error || j.message || res.statusText)
          setStatus(String(settings.success_text || 'Спасибо! Отзыв отправлен на модерацию.'))
          event.currentTarget.reset()
        })
        .catch((e) => setStatus(e.message || 'Не удалось отправить отзыв'))
        .finally(() => setPending(false))
    }
    return h('form', {
      onSubmit,
      style: { ...css.widget, maxWidth: 560, border: '1px solid var(--border, #27272a)', borderRadius: 12, padding: 20, display: 'grid', gap: 12 },
    },
      h('h2', { style: { margin: 0, fontSize: 22 } }, String(settings.title || 'Оставить отзыв')),
      h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
        h('input', { name: 'name', required: true, placeholder: 'Имя', style: css.input }),
        h('input', { name: 'email', type: 'email', placeholder: 'Email', style: css.input }),
      ),
      h('select', { name: 'rating', style: css.input },
        [5, 4, 3, 2, 1].map((n) => h('option', { key: String(n), value: String(n) }, `${n} из 5`)),
      ),
      h('textarea', { name: 'body', required: true, rows: 4, placeholder: 'Ваш отзыв', style: css.input }),
      h('button', { type: 'submit', disabled: pending || editMode, style: css.btn(true) }, pending ? 'Отправка…' : 'Отправить'),
      status ? h('p', { style: css.muted }, status) : null,
    )
  }

  return [
    {
      type: 'comments',
      label: 'Комментарии',
      category: 'content',
      stableType: true,
      defaultSettings: { title: 'Комментарии', target_type: 'page', target_id: '' },
      settingsFields: fields,
      Render: (props) => h(CommentListWidget, { settings: props.settings || {}, editMode: props.editMode, listType: 'comment' }),
    },
    {
      type: 'reviews',
      label: 'Отзывы',
      category: 'content',
      stableType: true,
      defaultSettings: { title: 'Отзывы', target_type: 'product', target_id: '' },
      settingsFields: fields,
      Render: (props) => h(CommentListWidget, { settings: props.settings || {}, editMode: props.editMode, listType: 'review' }),
    },
    {
      type: 'rating-summary',
      label: 'Рейтинг',
      category: 'content',
      stableType: true,
      defaultSettings: { target_type: 'product', target_id: '' },
      settingsFields: fields.slice(1),
      Render: (props) => h(RatingSummaryWidget, { settings: props.settings || {} }),
    },
    {
      type: 'review-form',
      label: 'Форма отзыва',
      category: 'content',
      stableType: true,
      defaultSettings: {
        title: 'Оставить отзыв', target_type: 'product', target_id: '',
        success_text: 'Спасибо! Отзыв отправлен на модерацию.',
      },
      settingsFields: [...fields, { key: 'success_text', label: 'Сообщение успеха', type: 'text' }],
      Render: (props) => h(ReviewFormWidget, { settings: props.settings || {}, editMode: props.editMode }),
    },
  ]
}

export const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,
  async register(ctx) {
    const ui = ctx.ui
    if (!ui?.createElement) {
      console.warn('[comments] ctx.ui missing')
      return
    }
    const Page = () => ui.createElement(AdminApp, { ui })
    const nav = {
      group: 'Коммуникации',
      path: '/admin/comments',
      label: 'Модерация',
      permission: 'comments.view',
      icon: 'message-square',
    }
    const page = {
      path: 'comments',
      label: 'Модерация',
      group: 'Коммуникации',
      permission: 'comments.view',
      Component: Page,
    }
    if (ctx.admin?.registerNavItem) {
      ctx.admin.registerNavItem(nav)
      ctx.admin.registerPage?.(page)
    } else {
      ctx.registerAdminNavItem?.(nav)
      ctx.registerAdminRoute?.(page)
    }
    for (const w of widgetDefs(ui)) {
      if (ctx.builder?.registerWidget) ctx.builder.registerWidget(w)
      else ctx.registerBuilderWidget?.(w)
    }
  },
  async unregister() {},
}

export default JaseflyFrontendModule
