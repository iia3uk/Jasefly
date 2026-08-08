/**
 * Webhooks admin — package FE (no host CRUD dependency).
 */
const SLUG = 'webhooks'
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
    /* */
  }
  if (!res.ok) throw new Error(json?.error || json?.message || text || res.statusText)
  return json?.data ?? json
}

const css = {
  page: { maxWidth: 880, color: '#e4e4e7', paddingBottom: 40 },
  title: { margin: '0 0 8px', fontSize: 24, fontWeight: 650, color: '#fafafa' },
  hint: { margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, color: '#a1a1aa' },
  panel: {
    border: '1px solid #27272a',
    borderRadius: 16,
    background: 'rgba(24,24,27,.55)',
    padding: 18,
    marginBottom: 14,
  },
  row: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' },
  input: {
    flex: '1 1 160px',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #3f3f46',
    background: '#09090b',
    color: '#fafafa',
    font: 'inherit',
  },
  btn: (primary, danger) => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '9px 14px',
    borderRadius: 10,
    border: danger
      ? '1px solid rgba(248,113,113,.35)'
      : primary
        ? '1px solid rgba(56,189,248,.4)'
        : '1px solid #3f3f46',
    background: danger ? 'transparent' : primary ? '#0369a1' : 'transparent',
    color: danger ? '#fca5a5' : primary ? '#e0f2fe' : '#e4e4e7',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 13,
  }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', color: '#71717a', padding: '8px 6px', borderBottom: '1px solid #27272a' },
  td: { padding: '10px 6px', borderBottom: '1px solid #1f1f23', color: '#e4e4e7', wordBreak: 'break-all' },
  err: { color: '#fca5a5', fontSize: 13, marginBottom: 12 },
  muted: { color: '#71717a', fontSize: 12 },
}

function AdminApp({ ui }) {
  const { createElement: h, useState, useEffect } = ui
  const [items, setItems] = useState([])
  const [event, setEvent] = useState('*')
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () =>
    apiFetch('/admin/webhooks')
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))

  useEffect(() => {
    reload()
  }, [])

  const create = () => {
    setBusy(true)
    setError('')
    apiFetch('/admin/webhooks', {
      method: 'POST',
      body: JSON.stringify({ event, url, secret }),
    })
      .then(() => {
        setUrl('')
        setSecret('')
        return reload()
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const remove = (id) => {
    if (!confirm('Удалить webhook?')) return
    setBusy(true)
    apiFetch(`/admin/webhooks/${id}`, { method: 'DELETE' })
      .then(() => reload())
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const toggle = (row) => {
    setBusy(true)
    apiFetch(`/admin/webhooks/${row.id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: !row.is_active }),
    })
      .then(() => reload())
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  return h('div', { style: css.page },
    h('h1', { style: css.title }, 'Webhooks'),
    h('p', { style: css.hint },
      'Исходящие HTTP-колбэки на события CMS. URL проверяется SSRF-guard платформы.'),
    error ? h('div', { style: css.err }, error) : null,
    h('div', { style: css.panel },
      h('div', { style: css.row },
        h('input', {
          style: css.input,
          value: event,
          placeholder: 'Событие (* = все)',
          onChange: (e) => setEvent(e.target.value),
        }),
        h('input', {
          style: { ...css.input, flex: '2 1 240px' },
          value: url,
          placeholder: 'https://example.com/hook',
          onChange: (e) => setUrl(e.target.value),
        }),
        h('input', {
          style: css.input,
          value: secret,
          placeholder: 'Секрет (опц.)',
          onChange: (e) => setSecret(e.target.value),
        }),
        h('button', {
          type: 'button',
          style: css.btn(true, false),
          disabled: busy || !url,
          onClick: create,
        }, 'Добавить'),
      ),
      h('p', { style: css.muted }, 'События: resource.afterSave, page.afterPublish, contact.message, *'),
    ),
    h('div', { style: css.panel },
      h('table', { style: css.table },
        h('thead', null,
          h('tr', null,
            h('th', { style: css.th }, 'ID'),
            h('th', { style: css.th }, 'Событие'),
            h('th', { style: css.th }, 'URL'),
            h('th', { style: css.th }, 'Активен'),
            h('th', { style: css.th }, ''),
          ),
        ),
        h('tbody', null,
          items.length === 0
            ? h('tr', null, h('td', { style: css.td, colSpan: 5 }, 'Пока нет подписок'))
            : items.map((row) =>
              h('tr', { key: String(row.id) },
                h('td', { style: css.td }, String(row.id)),
                h('td', { style: css.td }, row.event || '*'),
                h('td', { style: css.td }, row.url || ''),
                h('td', { style: css.td },
                  h('button', {
                    type: 'button',
                    style: css.btn(false, false),
                    disabled: busy,
                    onClick: () => toggle(row),
                  }, row.is_active ? 'Да' : 'Нет'),
                ),
                h('td', { style: css.td },
                  h('button', {
                    type: 'button',
                    style: css.btn(false, true),
                    disabled: busy,
                    onClick: () => remove(row.id),
                  }, 'Удалить'),
                ),
              ),
            ),
        ),
      ),
    ),
  )
}

export const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,
  async register(ctx) {
    const ui = ctx.ui
    if (!ui?.createElement) {
      console.warn('[webhooks] ctx.ui missing')
      return
    }
    const Page = () => ui.createElement(AdminApp, { ui })
    const nav = {
      group: 'Интеграции',
      path: '/admin/webhooks',
      label: 'Webhooks',
      permission: 'integrations.manage',
      icon: 'webhook',
    }
    const page = {
      path: 'webhooks',
      label: 'Webhooks',
      group: 'Интеграции',
      permission: 'integrations.manage',
      Component: Page,
    }
    if (ctx.admin?.registerNavItem) {
      ctx.admin.registerNavItem(nav)
      ctx.admin.registerPage?.(page)
    } else {
      ctx.registerAdminNavItem?.(nav)
      ctx.registerAdminRoute?.(page)
    }
  },
  async unregister() {},
}

export default JaseflyFrontendModule
