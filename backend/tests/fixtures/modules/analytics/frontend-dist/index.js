/**
 * Analytics package FE — admin overview, site beacon slot, dashboard card.
 */
const SLUG = 'analytics'
const VERSION = '1.0.0'
const API = '/api/v1'

const VISITOR_KEY = 'jasefly_analytics_visitor'
const SESSION_KEY = 'jasefly_analytics_session'

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

function storageToken(key, storage) {
  let value = storage.getItem(key)
  if (!value) {
    value = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    storage.setItem(key, value)
  }
  return value
}

function trackAnalytics(event, data = {}) {
  if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return
  const payload = JSON.stringify({
    event,
    path: typeof location !== 'undefined' ? location.pathname : '/',
    referrer: typeof document !== 'undefined' ? document.referrer : '',
    visitor_id: storageToken(VISITOR_KEY, localStorage),
    session_id: storageToken(SESSION_KEY, sessionStorage),
    ...data,
  })
  const url = `${API}/analytics/collect`
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
    return
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
    credentials: 'same-origin',
  })
}

function currentPathname() {
  if (typeof window === 'undefined') return '/'
  return window.location.pathname + window.location.search + window.location.hash
}

function Beacon({ ui, host }) {
  const { createElement: h, useEffect, useRef, useState } = ui
  const [pathname, setPathname] = useState(() => currentPathname())
  const lastSent = useRef('')

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const sync = () => setPathname(currentPathname())
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    const timer = window.setInterval(sync, 1500)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!host?.allowsConsentCategory?.('analytics')) return
    if (!pathname || pathname === lastSent.current) return
    lastSent.current = pathname
    trackAnalytics('page_view', { path: pathname })
  }, [host, pathname])

  return null
}

const css = {
  page: { maxWidth: 1080, color: '#e4e4e7', paddingBottom: 40 },
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
  grid: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' },
  stat: {
    borderRadius: 12,
    border: '1px solid #27272a',
    background: 'rgba(9,9,11,.6)',
    padding: '14px 16px',
  },
  statLabel: { fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em' },
  statValue: { marginTop: 6, fontSize: 28, fontWeight: 650, color: '#fafafa', fontVariantNumeric: 'tabular-nums' },
  input: {
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid #3f3f46',
    background: '#09090b',
    color: '#fafafa',
    font: 'inherit',
    fontSize: 13,
  },
  btn: (primary) => ({
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 13,
    border: primary ? '1px solid rgba(56,189,248,.4)' : '1px solid #3f3f46',
    background: primary ? '#0369a1' : 'transparent',
    color: primary ? '#e0f2fe' : '#e4e4e7',
  }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', color: '#71717a', padding: '8px 6px', borderBottom: '1px solid #27272a' },
  td: { padding: '10px 6px', borderBottom: '1px solid #1f1f23', color: '#e4e4e7', wordBreak: 'break-all' },
  err: { color: '#fca5a5', fontSize: 13, marginBottom: 12 },
  muted: { color: '#71717a', fontSize: 12 },
}

function isoDate(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function AdminApp({ ui }) {
  const { createElement: h, useState, useEffect } = ui
  const [from, setFrom] = useState(isoDate(-29))
  const [to, setTo] = useState(isoDate())
  const [data, setData] = useState(null)
  const [goals, setGoals] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [goalEvent, setGoalEvent] = useState('page_view')

  const reload = () => {
    setError('')
    return Promise.all([
      apiFetch(`/admin/analytics/overview?from=${from}&to=${to}`),
      apiFetch('/admin/analytics/goals'),
    ])
      .then(([overview, goalRows]) => {
        setData(overview)
        setGoals(Array.isArray(goalRows) ? goalRows : [])
      })
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    reload()
  }, [from, to])

  const aggregate = () => {
    setBusy(true)
    apiFetch('/admin/analytics/aggregate', {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    })
      .then(() => reload())
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const addGoal = () => {
    if (!goalName.trim()) return
    setBusy(true)
    apiFetch('/admin/analytics/goals', {
      method: 'POST',
      body: JSON.stringify({ name: goalName.trim(), event_name: goalEvent, is_active: true }),
    })
      .then(() => {
        setGoalName('')
        return reload()
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const removeGoal = (id) => {
    if (!confirm('Удалить цель?')) return
    setBusy(true)
    apiFetch(`/admin/analytics/goals/${id}`, { method: 'DELETE' })
      .then(() => reload())
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const summary = data?.summary || {}
  const daily = Array.isArray(data?.daily) ? data.daily : []
  const events = Array.isArray(data?.events) ? data.events : []
  const pages = Array.isArray(data?.pages) ? data.pages : []

  return h('div', { style: css.page },
    h('h1', { style: css.title }, 'Аналитика'),
    h('p', { style: css.hint },
      'События сайта без хранения исходных IP. Beacon на публичных страницах пишет в /analytics/collect.'),
    error ? h('div', { style: css.err }, error) : null,
    h('div', { style: css.row },
      h('input', { type: 'date', style: css.input, value: from, onChange: (e) => setFrom(e.target.value) }),
      h('span', { style: css.muted }, '—'),
      h('input', { type: 'date', style: css.input, value: to, onChange: (e) => setTo(e.target.value) }),
      h('button', { type: 'button', style: css.btn(false), disabled: busy, onClick: () => reload() }, 'Обновить'),
      h('button', { type: 'button', style: css.btn(true), disabled: busy, onClick: aggregate }, 'Агрегировать'),
    ),
    h('div', { style: { ...css.panel, ...css.grid } },
      [
        ['Просмотры', summary.page_views],
        ['Посетители', summary.visitors],
        ['Сессии', summary.sessions],
        ['События', summary.events],
      ].map(([label, value]) =>
        h('div', { key: label, style: css.stat },
          h('div', { style: css.statLabel }, label),
          h('div', { style: css.statValue }, Number(value || 0).toLocaleString('ru')),
        ),
      ),
    ),
    !daily.length && !events.length
      ? h('div', { style: css.panel }, h('p', { style: css.muted }, 'За период событий нет — откройте публичные страницы или смените даты.'))
      : h('div', { style: { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' } },
        h('div', { style: css.panel },
          h('h2', { style: { margin: '0 0 8px', fontSize: 16, color: '#fafafa' } }, 'События'),
          h('table', { style: css.table },
            h('thead', null, h('tr', null,
              h('th', { style: css.th }, 'Событие'),
              h('th', { style: css.th }, 'Кол-во'),
              h('th', { style: css.th }, 'Люди'),
            )),
            h('tbody', null,
              events.length === 0
                ? h('tr', null, h('td', { style: css.td, colSpan: 3 }, '—'))
                : events.map((row) =>
                  h('tr', { key: row.event_name },
                    h('td', { style: css.td }, row.event_name),
                    h('td', { style: css.td }, String(row.count)),
                    h('td', { style: css.td }, String(row.visitors)),
                  ),
                ),
            ),
          ),
        ),
        h('div', { style: css.panel },
          h('h2', { style: { margin: '0 0 8px', fontSize: 16, color: '#fafafa' } }, 'Топ страниц'),
          h('table', { style: css.table },
            h('thead', null, h('tr', null,
              h('th', { style: css.th }, 'Путь'),
              h('th', { style: css.th }, 'Просмотры'),
            )),
            h('tbody', null,
              pages.length === 0
                ? h('tr', null, h('td', { style: css.td, colSpan: 2 }, '—'))
                : pages.slice(0, 15).map((row) =>
                  h('tr', { key: row.path || '/' },
                    h('td', { style: css.td }, row.path || '/'),
                    h('td', { style: css.td }, String(row.views)),
                  ),
                ),
            ),
          ),
        ),
      ),
    h('div', { style: css.panel },
      h('h2', { style: { margin: '0 0 8px', fontSize: 16, color: '#fafafa' } }, 'Цели'),
      h('div', { style: css.row },
        h('input', {
          style: { ...css.input, flex: '1 1 160px' },
          placeholder: 'Название цели',
          value: goalName,
          onChange: (e) => setGoalName(e.target.value),
        }),
        h('select', {
          style: css.input,
          value: goalEvent,
          onChange: (e) => setGoalEvent(e.target.value),
        },
          ['page_view', 'form_submit', 'order_created', 'payment_completed', 'custom_event'].map((ev) =>
            h('option', { key: ev, value: ev }, ev),
          ),
        ),
        h('button', { type: 'button', style: css.btn(true), disabled: busy, onClick: addGoal }, 'Добавить'),
      ),
      h('table', { style: css.table },
        h('thead', null, h('tr', null,
          h('th', { style: css.th }, 'Название'),
          h('th', { style: css.th }, 'Событие'),
          h('th', { style: css.th }, ''),
        )),
        h('tbody', null,
          goals.length === 0
            ? h('tr', null, h('td', { style: css.td, colSpan: 3 }, 'Целей пока нет'))
            : goals.map((g) =>
              h('tr', { key: String(g.id) },
                h('td', { style: css.td }, g.name),
                h('td', { style: css.td }, g.event_name),
                h('td', { style: css.td },
                  h('button', {
                    type: 'button',
                    style: css.btn(false),
                    disabled: busy,
                    onClick: () => removeGoal(g.id),
                  }, 'Удалить'),
                ),
              ),
            ),
        ),
      ),
    ),
  )
}

function DashboardCard({ ui }) {
  const { createElement: h, useEffect, useState } = ui
  const [data, setData] = useState(null)
  const from = isoDate(-13)
  const to = isoDate()

  useEffect(() => {
    apiFetch(`/admin/analytics/overview?from=${from}&to=${to}`)
      .then(setData)
      .catch(() => setData(null))
  }, [])

  const s = data?.summary || {}
  return h('div', {
    style: {
      border: '1px solid #27272a',
      borderRadius: 14,
      padding: 16,
      background: 'rgba(24,24,27,.45)',
      color: '#e4e4e7',
    },
  },
    h('p', { style: { margin: 0, fontSize: 11, color: '#5eead4', textTransform: 'uppercase', letterSpacing: '0.12em' } }, 'Аналитика · 14 дней'),
    h('div', { style: { ...css.grid, marginTop: 12 } },
      [
        ['Просмотры', s.page_views],
        ['Люди', s.visitors],
        ['Сессии', s.sessions],
      ].map(([label, value]) =>
        h('div', { key: label },
          h('div', { style: css.statLabel }, label),
          h('div', { style: { ...css.statValue, fontSize: 22 } }, Number(value || 0).toLocaleString('ru')),
        ),
      ),
    ),
  )
}

function registerHostAdminPage(ctx, spec) {
  const { path, label, group, permission, hostPageKey, icon } = spec
  const nav = { group, path: `/admin/${path}`, label, permission, icon }
  const HostComp = ctx.admin?.resolveHostPage?.(hostPageKey)
  const Fallback = () => ctx.ui.createElement(AdminApp, { ui: ctx.ui })
  const page = {
    path,
    label,
    group,
    permission,
    hostPageKey,
    Component: HostComp || Fallback,
  }
  if (ctx.admin?.registerNavItem) {
    ctx.admin.registerNavItem(nav)
    ctx.admin.registerPage?.(page)
  } else {
    ctx.registerAdminNavItem?.(nav)
    ctx.registerAdminRoute?.(page)
  }
}

export const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,
  async register(ctx) {
    const ui = ctx.ui
    if (!ui?.createElement) {
      console.warn('[analytics] ctx.ui missing')
      return
    }

    registerHostAdminPage(ctx, {
      path: 'analytics',
      label: 'Аналитика',
      group: 'Система',
      permission: 'analytics.view',
      hostPageKey: 'analytics.admin',
      icon: 'bar-chart-3',
    })

    if (ctx.host?.registerSlot) {
      ctx.host.registerSlot(
        'site.body.end',
        () => ui.createElement(Beacon, { ui, host: ctx.host }),
        {
          id: 'beacon',
          requiresConsentCategory: 'analytics',
          order: 50,
        },
      )
      ctx.host.registerSlot(
        'admin.dashboard',
        () => ui.createElement(DashboardCard, { ui }),
        {
          id: 'pulse',
          order: 40,
        },
      )
    } else if (ctx.admin?.registerDashboardCard) {
      ctx.admin.registerDashboardCard({
        id: 'analytics-pulse',
        label: 'Пульс сайта',
        render: () => ui.createElement(DashboardCard, { ui }),
      })
    }
  },
  async unregister() {},
}

export default JaseflyFrontendModule
