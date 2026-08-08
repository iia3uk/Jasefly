/**
 * Synthetic SDK boundary probe FE — admin page + stableType widget.
 * Ships own Component (self-contained package admin UI).
 */
const SLUG = 'sdk-boundary-probe'
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

function AdminApp({ ui }) {
  const { createElement: h, useState, useEffect } = ui
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/admin/sdk-boundary-probe/ping')
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  return h('div', { style: { maxWidth: 640, color: '#e4e4e7', paddingBottom: 32 } },
    h('h1', { style: { margin: '0 0 8px', fontSize: 22 } }, 'SDK Boundary Probe'),
    h('p', { style: { color: '#a1a1aa', fontSize: 14 } }, 'Synthetic module — no product features.'),
    error ? h('p', { style: { color: '#fca5a5' } }, error) : null,
    data ? h('pre', {
      style: {
        marginTop: 12, padding: 12, borderRadius: 12,
        border: '1px solid #27272a', background: 'rgba(24,24,27,.55)', fontSize: 12,
      },
    }, JSON.stringify(data, null, 2)) : h('p', { style: { color: '#71717a' } }, 'Loading…'),
  )
}

function ProbeWidget({ ui, settings = {}, editMode }) {
  const { createElement: h } = ui
  const label = String(settings.label || 'SDK Probe')
  if (editMode) {
    return h('div', {
      style: {
        padding: 16, borderRadius: 12, border: '1px dashed rgba(56,189,248,.35)',
        color: '#a1a1aa', fontSize: 14, textAlign: 'center',
      },
    }, label)
  }
  return h('div', {
    style: { padding: 12, borderRadius: 12, border: '1px solid var(--border, #3f3f46)', fontSize: 14 },
    'data-sdk-probe': '1',
  }, label)
}

export const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,
  async register(ctx) {
    const ui = ctx.ui
    if (!ui?.createElement) {
      console.warn('[sdk-boundary-probe] ctx.ui missing')
      return
    }
    const Comp = () => ui.createElement(AdminApp, { ui })
    const page = {
      path: 'sdk-boundary-probe',
      label: 'SDK Probe',
      group: 'Разработка',
      permission: 'sdk-boundary-probe.view',
      Component: Comp,
    }
    const nav = {
      group: 'Разработка',
      path: '/admin/sdk-boundary-probe',
      label: 'SDK Probe',
      permission: 'sdk-boundary-probe.view',
      icon: 'flask-conical',
    }
    if (ctx.admin?.registerPage) {
      ctx.admin.registerNavItem?.(nav)
      ctx.admin.registerPage(page)
    } else {
      ctx.registerAdminNavItem?.(nav)
      ctx.registerAdminRoute?.(page)
    }

    const widget = {
      type: 'sdk-probe',
      label: 'SDK Probe',
      category: 'basic',
      stableType: true,
      defaultSettings: { label: 'SDK Probe' },
      settingsFields: [{ key: 'label', label: 'Текст', type: 'text' }],
      Render: (props) => ui.createElement(ProbeWidget, {
        ui,
        settings: props.settings || {},
        editMode: props.editMode,
      }),
    }
    if (ctx.builder?.registerWidget) ctx.builder.registerWidget(widget)
    else ctx.registerBuilderWidget?.(widget)
  },
  async unregister() {},
}

export default JaseflyFrontendModule
