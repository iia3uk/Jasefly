/**
 * Cookie Consent — public chrome + admin (Jasefly dark).
 * Mounts banner/modal/widget on public site via createRoot portal.
 */
const SLUG = 'cookie-consent'
const VERSION = '1.0.1'
const API = '/api/v1'
const STORAGE_KEY = 'jasefly_cookie_consent'

function authHeaders(extra = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { credentials: 'same-origin', ...opts, headers: authHeaders(opts.headers || {}) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* */ }
  if (!res.ok) throw new Error(json?.error || json?.message || text || res.statusText)
  return json?.data ?? json
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    if (raw === 'all') return { necessary: true, analytics: true, marketing: true, _legacy: 'all' }
    if (raw === 'necessary') return { necessary: true, analytics: false, marketing: false, _legacy: 'necessary' }
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.categories) return parsed.categories
    if (parsed && typeof parsed === 'object') return parsed
  } catch { /* */ }
  return null
}

function writeStored(categories, meta = {}) {
  try {
    const payload = {
      v: 2,
      categories,
      policy_version: meta.policy_version || '1',
      at: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    // Legacy bridge for core SeoHead until it reads categories
    const analytics = !!categories.analytics
    const marketing = !!categories.marketing
    const legacy = analytics || marketing ? 'all' : 'necessary'
    window.dispatchEvent(new CustomEvent('jasefly-cookie-consent', { detail: legacy }))
    window.dispatchEvent(new CustomEvent('jasefly-cookie:change', { detail: { categories, ...meta } }))
  } catch { /* */ }
}

function visitorKey() {
  try {
    let k = localStorage.getItem('jasefly_cookie_vid')
    if (!k) {
      k = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem('jasefly_cookie_vid', k)
    }
    return k
  } catch {
    return ''
  }
}

const css = {
  page: { maxWidth: 920, color: '#e4e4e7', paddingBottom: 40 },
  eyebrow: { margin: 0, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#38bdf8' },
  title: { margin: '6px 0 8px', fontSize: 26, fontWeight: 650, color: '#fafafa' },
  hint: { margin: 0, fontSize: 14, lineHeight: 1.55, color: '#a1a1aa', maxWidth: 640 },
  panel: {
    border: '1px solid #27272a', borderRadius: 16, background: 'rgba(24,24,27,.55)',
    padding: 18, marginBottom: 14,
  },
  label: { display: 'grid', gap: 6, marginBottom: 12, fontSize: 13, color: '#a1a1aa' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #3f3f46', background: '#09090b', color: '#fafafa', font: 'inherit',
  },
  btn: (primary) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10,
    border: primary ? '1px solid rgba(56,189,248,.4)' : '1px solid #3f3f46',
    background: primary ? '#0369a1' : 'transparent', color: primary ? '#e0f2fe' : '#e4e4e7',
    cursor: 'pointer', font: 'inherit', fontSize: 13,
  }),
  muted: { color: '#71717a', fontSize: 12, lineHeight: 1.45 },
  ok: { color: '#6ee7b7' },
  bad: { color: '#fca5a5' },
  row: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
}

function Field({ ui, label, hint, children }) {
  const { createElement: h } = ui
  return h('label', { style: css.label }, label, children, hint ? h('span', { style: css.muted }, hint) : null)
}

/* ── Public chrome ─────────────────────────────────────────── */

function PublicChrome({ ui }) {
  const { createElement: h, useState, useEffect, Fragment } = ui
  const [config, setConfig] = useState(null)
  const [openModal, setOpenModal] = useState(false)
  const [cats, setCats] = useState({})
  const [hasChoice, setHasChoice] = useState(false)

  const reloadChoice = () => {
    const stored = readStored()
    setHasChoice(!!stored)
    if (stored) setCats(stored)
  }

  useEffect(() => {
    apiFetch('/cookie-consent/config')
      .then((c) => {
        setConfig(c)
        const stored = readStored()
        if (stored) {
          setCats(stored)
          setHasChoice(true)
        } else {
          const init = {}
          for (const cat of c.categories || []) {
            init[cat.id] = !!(cat.required || cat.default)
          }
          setCats(init)
        }
      })
      .catch(() => {})

    const onOpen = () => setOpenModal(true)
    window.addEventListener('jasefly-cookie-open', onOpen)
    const onClick = (e) => {
      const t = e.target
      if (t && t.closest && t.closest('[data-jasefly-cookie-open]')) {
        e.preventDefault()
        setOpenModal(true)
      }
    }
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('jasefly-cookie-open', onOpen)
      document.removeEventListener('click', onClick)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.cookieConsentModule = '1'
    return () => { delete document.documentElement.dataset.cookieConsentModule }
  }, [])

  const save = (categories, source) => {
    const next = { ...categories, necessary: true }
    writeStored(next, { policy_version: config?.policy_version || '1', source })
    setCats(next)
    setHasChoice(true)
    setOpenModal(false)
    apiFetch('/cookie-consent/log', {
      method: 'POST',
      body: JSON.stringify({
        categories: next,
        source,
        policy_version: config?.policy_version || '1',
        visitor_key: visitorKey(),
      }),
    }).catch(() => {})
  }

  useEffect(() => {
    window.jaseflyCookieGate = {
      open: () => setOpenModal(true),
      get: () => readStored(),
      set: (categories, source = 'api') => save({ ...categories, necessary: true }, source),
      allows: (id) => {
        const c = readStored()
        if (!c) return id === 'necessary'
        return !!c[id]
      },
      reload: reloadChoice,
    }
    return () => {
      try { delete window.jaseflyCookieGate } catch { /* */ }
    }
  })

  if (!config || !Number(config.enabled)) return null

  const categories = config.categories || []
  const showBanner = !hasChoice
  const showWidget = hasChoice && Number(config.show_floating_widget)

  return h(Fragment, null,
    showBanner ? h('div', {
      style: {
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 90,
        borderTop: '1px solid rgba(255,255,255,.1)',
        background: 'rgba(18,18,27,.96)',
        padding: '16px 16px max(16px, env(safe-area-inset-bottom))',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 -8px 32px rgba(0,0,0,.35)',
      },
      role: 'dialog',
      'aria-label': 'Согласие на cookies',
      'data-cms-cookie-banner': '1',
      'data-translate-root': '1',
    },
      h('div', { style: { maxWidth: 960, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' } },
        h('div', { style: { flex: '1 1 240px', color: '#a1a1aa', fontSize: 14, lineHeight: 1.5 } },
          h('div', { style: { color: '#fafafa', fontWeight: 600, marginBottom: 4 } }, config.banner_title || 'Файлы cookie'),
          h('p', { style: { margin: 0 } }, config.banner_text || ''),
        ),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
          h('button', { type: 'button', style: css.btn(false), onClick: () => setOpenModal(true) }, 'Настроить'),
          h('button', {
            type: 'button', style: css.btn(false),
            onClick: () => {
              const only = { necessary: true }
              for (const c of categories) {
                if (c.id !== 'necessary') only[c.id] = false
              }
              save(only, 'banner_necessary')
            },
          }, 'Только необходимые'),
          h('button', {
            type: 'button', style: css.btn(true),
            onClick: () => {
              const all = { necessary: true }
              for (const c of categories) all[c.id] = true
              save(all, 'banner_all')
            },
          }, 'Принять все'),
        ),
      ),
    ) : null,

    showWidget ? h('button', {
      type: 'button',
      title: 'Настройки cookie',
      'aria-label': 'Настройки cookie',
      onClick: () => setOpenModal(true),
      style: {
        position: 'fixed', left: 16, bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
        zIndex: 85, width: 44, height: 44, borderRadius: 999,
        border: '1px solid rgba(255,255,255,.15)', background: 'rgba(24,24,27,.9)',
        color: '#e4e4e7', cursor: 'pointer', fontSize: 18, boxShadow: '0 8px 24px rgba(0,0,0,.35)',
      },
    }, '🍪') : null,

    openModal ? h('div', {
      style: {
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      },
      onClick: (e) => { if (e.target === e.currentTarget && hasChoice) setOpenModal(false) },
    },
      h('div', {
        role: 'dialog',
        'aria-modal': 'true',
        style: {
          width: 'min(520px, 100%)', maxHeight: '90vh', overflow: 'auto',
          borderRadius: 16, border: '1px solid #27272a', background: '#12121a', padding: 20, color: '#e4e4e7',
        },
      },
        h('h2', { style: { margin: '0 0 8px', fontSize: 18, color: '#fafafa' } }, config.banner_title || 'Настройки cookie'),
        h('p', { style: { margin: '0 0 16px', fontSize: 13, color: '#a1a1aa', lineHeight: 1.5 } }, config.modal_text || ''),
        categories.map((cat) => h('label', {
          key: cat.id,
          style: {
            display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8,
            padding: '8px 10px', borderRadius: 12, border: '1px solid #27272a', background: 'rgba(255,255,255,.03)',
            cursor: cat.required ? 'default' : 'pointer',
          },
        },
          h('input', {
            type: 'checkbox',
            checked: cat.required ? true : !!cats[cat.id],
            disabled: !!cat.required,
            style: {
              width: 18, height: 18, minWidth: 18, flexShrink: 0,
              margin: 0, accentColor: '#38bdf8', cursor: cat.required ? 'default' : 'pointer',
            },
            onChange: (e) => {
              if (cat.required) return
              setCats({ ...cats, [cat.id]: e.target.checked, necessary: true })
            },
          }),
          h('span', { style: { minWidth: 0, flex: 1 } },
            h('div', { style: { fontWeight: 600, color: '#f4f4f5', fontSize: 14, lineHeight: 1.25 } }, cat.label),
            h('div', { style: { fontSize: 12, color: '#71717a', marginTop: 5, lineHeight: 1.4 } }, cat.description || ''),
          ),
        )),
        h('p', { style: { ...css.muted, marginTop: 12 } },
          h('a', { href: config.policy_href || '/privacy', style: { color: '#7dd3fc' } }, 'Политика конфиденциальности'),
          ` · версия ${config.policy_version || '1'}`,
        ),
        h('div', { style: { ...css.row, marginTop: 14, marginBottom: 0 } },
          h('button', {
            type: 'button', style: css.btn(true),
            onClick: () => {
              const all = { necessary: true }
              for (const c of categories) all[c.id] = true
              save(all, 'modal_all')
            },
          }, 'Принять все'),
          h('button', {
            type: 'button', style: css.btn(false),
            onClick: () => save({ ...cats, necessary: true }, 'modal'),
          }, 'Сохранить выбор'),
          hasChoice ? h('button', { type: 'button', style: css.btn(false), onClick: () => setOpenModal(false) }, 'Закрыть') : null,
        ),
      ),
    ) : null,
  )
}

/* ── Admin ─────────────────────────────────────────────────── */

function AdminApp({ ui }) {
  const { createElement: h, useState, useEffect } = ui
  const [settings, setSettings] = useState(null)
  const [stats, setStats] = useState(null)
  const [log, setLog] = useState([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => {
    setError('')
    return Promise.all([
      apiFetch('/admin/cookie-consent/settings'),
      apiFetch('/admin/cookie-consent/stats'),
      apiFetch('/admin/cookie-consent/log?limit=50'),
    ]).then(([s, st, l]) => {
      setSettings(s)
      setStats(st)
      setLog(Array.isArray(l) ? l : [])
    }).catch((e) => setError(e.message))
  }
  useEffect(() => { reload().catch(() => {}) }, [])

  const save = () => {
    if (!settings) return
    setBusy(true)
    setMsg('')
    apiFetch('/admin/cookie-consent/settings', { method: 'PUT', body: JSON.stringify(settings) })
      .then((s) => { setSettings(s); setMsg('Сохранено') })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const addPreset = (presetId) => {
    const presets = settings?.presets || []
    const p = presets.find((x) => x.id === presetId)
    if (!p) return
    const providers = Array.isArray(settings.providers) ? [...settings.providers] : []
    if (providers.some((x) => x.preset_id === presetId)) {
      setMsg('Пресет уже добавлен')
      return
    }
    providers.push({
      id: presetId + '_' + Date.now().toString(36),
      preset_id: presetId,
      label: p.label,
      category: p.category,
      markers: p.markers,
      custom: false,
    })
    setSettings({ ...settings, providers })
  }

  if (!settings) {
    return h('div', { style: { ...css.page, padding: 24 } }, error || 'Загрузка…')
  }

  return h('div', { style: css.page },
    h('p', { style: css.eyebrow }, 'SEO · GDPR / 152-ФЗ'),
    h('h1', { style: css.title }, 'Cookie Consent'),
    h('p', { style: css.hint },
      'Категории cookie, пресеты аналитики/рекламы, журнал согласий и публичный API window.jaseflyCookieGate. Core-баннер скрыт, пока модуль включён.'),
    error ? h('p', { style: { ...css.bad, marginBottom: 12 } }, error) : null,
    msg ? h('p', { style: { ...css.ok, marginBottom: 12 } }, msg) : null,

    h('div', { style: css.panel },
      h('label', { style: { display: 'flex', gap: 10, alignItems: 'center', color: '#d4d4d8', marginBottom: 14 } },
        h('input', {
          type: 'checkbox', checked: !!Number(settings.enabled),
          onChange: (e) => setSettings({ ...settings, enabled: e.target.checked ? 1 : 0 }),
        }),
        'Модуль активен на сайте',
      ),
      h(Field, { ui, label: 'Заголовок баннера' },
        h('input', { style: css.input, value: settings.banner_title || '', onChange: (e) => setSettings({ ...settings, banner_title: e.target.value }) })),
      h(Field, { ui, label: 'Текст баннера' },
        h('textarea', { rows: 3, style: css.input, value: settings.banner_text || '', onChange: (e) => setSettings({ ...settings, banner_text: e.target.value }) })),
      h(Field, { ui, label: 'Текст модалки' },
        h('textarea', { rows: 3, style: css.input, value: settings.modal_text || '', onChange: (e) => setSettings({ ...settings, modal_text: e.target.value }) })),
      h(Field, { ui, label: 'Ссылка на политику', hint: 'По умолчанию /privacy' },
        h('input', { style: css.input, value: settings.policy_href || '', onChange: (e) => setSettings({ ...settings, policy_href: e.target.value }) })),
      h(Field, { ui, label: 'Версия политики' },
        h('input', { style: css.input, value: settings.policy_version || '1', onChange: (e) => setSettings({ ...settings, policy_version: e.target.value }) })),
      h('label', { style: { display: 'flex', gap: 10, alignItems: 'center', color: '#d4d4d8', marginBottom: 14 } },
        h('input', {
          type: 'checkbox', checked: !!Number(settings.show_floating_widget),
          onChange: (e) => setSettings({ ...settings, show_floating_widget: e.target.checked ? 1 : 0 }),
        }),
        'Плавающий виджет «изменить выбор»',
      ),
      h(Field, { ui, label: 'Хранение логов (дней)' },
        h('input', {
          type: 'number', style: css.input, value: settings.log_retention_days || 365,
          onChange: (e) => setSettings({ ...settings, log_retention_days: Number(e.target.value) || 365 }),
        })),
      h('button', { type: 'button', style: css.btn(true), disabled: busy, onClick: save }, 'Сохранить'),
    ),

    h('div', { style: css.panel },
      h('h2', { style: { marginTop: 0, fontSize: 16, color: '#f4f4f5' } }, 'Пресеты провайдеров'),
      h('p', { style: css.muted }, 'Маркеры для отложенной загрузки / блокировки. Подключайте нужные площадки.'),
      h('div', { style: css.row },
        (settings.presets || []).map((p) => h('button', {
          key: p.id, type: 'button', style: css.btn(false), disabled: busy,
          onClick: () => addPreset(p.id),
        }, `+ ${p.label}`)),
      ),
      (settings.providers || []).length === 0
        ? h('p', { style: css.muted }, 'Пресеты не добавлены')
        : h('ul', { style: { margin: 0, paddingLeft: 18, color: '#a1a1aa', fontSize: 13 } },
          settings.providers.map((p, i) => h('li', { key: p.id || i, style: { marginBottom: 6 } },
            `${p.label} (${p.category})`,
            ' ',
            h('button', {
              type: 'button', style: { ...css.btn(false), padding: '2px 8px', fontSize: 11 },
              onClick: () => setSettings({
                ...settings,
                providers: settings.providers.filter((_, idx) => idx !== i),
              }),
            }, 'Убрать'),
          )),
        ),
      h('button', { type: 'button', style: { ...css.btn(true), marginTop: 10 }, disabled: busy, onClick: save }, 'Сохранить провайдеров'),
    ),

    h('div', { style: css.panel },
      h('h2', { style: { marginTop: 0, fontSize: 16, color: '#f4f4f5' } }, 'Статистика'),
      h('p', { style: { color: '#d4d4d8', margin: '0 0 8px' } }, `Всего записей: ${stats?.total ?? 0}`),
      h('div', { style: css.row },
        h('a', {
          href: `${API}/admin/cookie-consent/export?format=csv`,
          style: css.btn(false),
          onClick: (e) => {
            e.preventDefault()
            const token = localStorage.getItem('access_token')
            fetch(`${API}/admin/cookie-consent/export?format=csv`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }).then((r) => r.blob()).then((b) => {
              const a = document.createElement('a')
              a.href = URL.createObjectURL(b)
              a.download = 'cookie-consents.csv'
              a.click()
            }).catch((err) => setError(err.message))
          },
        }, 'Экспорт CSV'),
        h('button', {
          type: 'button', style: css.btn(false),
          onClick: () => {
            const token = localStorage.getItem('access_token')
            fetch(`${API}/admin/cookie-consent/export?format=xlsx`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }).then((r) => r.blob()).then((b) => {
              const a = document.createElement('a')
              a.href = URL.createObjectURL(b)
              a.download = 'cookie-consents.xls'
              a.click()
            }).catch((err) => setError(err.message))
          },
        }, 'Экспорт Excel'),
        h('button', {
          type: 'button', style: css.btn(false), disabled: busy,
          onClick: () => {
            if (!confirm('Удалить старые записи по retention?')) return
            apiFetch('/admin/cookie-consent/purge', { method: 'POST', body: '{}' })
              .then(() => { setMsg('Очистка выполнена'); return reload() })
              .catch((e) => setError(e.message))
          },
        }, 'Очистить старые логи'),
      ),
      (stats?.by_source || []).length > 0
        ? h('ul', { style: { color: '#a1a1aa', fontSize: 13 } },
          stats.by_source.map((r) => h('li', { key: r.source }, `${r.source}: ${r.cnt}`)))
        : null,
    ),

    h('div', { style: css.panel },
      h('h2', { style: { marginTop: 0, fontSize: 16, color: '#f4f4f5' } }, 'Журнал'),
      log.length === 0
        ? h('p', { style: css.muted }, 'Пока пусто')
        : h('div', { style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
            h('thead', null, h('tr', { style: { color: '#71717a', textAlign: 'left' } },
              ['Время', 'Источник', 'Версия', 'Категории'].map((c) =>
                h('th', { key: c, style: { padding: '8px 6px', borderBottom: '1px solid #27272a' } }, c)),
            )),
            h('tbody', null, log.map((row) => h('tr', { key: row.id },
              h('td', { style: { padding: '8px 6px', borderBottom: '1px solid #18181b', color: '#a1a1aa', whiteSpace: 'nowrap' } }, row.created_at || '—'),
              h('td', { style: { padding: '8px 6px', borderBottom: '1px solid #18181b' } }, row.source || '—'),
              h('td', { style: { padding: '8px 6px', borderBottom: '1px solid #18181b' } }, row.policy_version || '—'),
              h('td', { style: { padding: '8px 6px', borderBottom: '1px solid #18181b', color: '#71717a', fontFamily: 'ui-monospace,monospace', fontSize: 11 } },
                typeof row.categories_json === 'string' ? row.categories_json : JSON.stringify(row.categories_json || {})),
            ))),
          ),
        ),
    ),
  )
}

let portalHost = null
let portalRoot = null

export const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,
  async register(ctx) {
    const ui = ctx.ui
    if (!ui?.createElement) {
      console.warn('[cookie-consent] ctx.ui missing')
      return
    }

    // Public chrome portal
    if (typeof document !== 'undefined' && ui.createRoot) {
      try {
        portalRoot?.unmount()
        portalHost?.remove()
      } catch { /* */ }
      const host = document.createElement('div')
      host.id = 'jasefly-cookie-consent-root'
      host.setAttribute('data-no-translate', '1')
      document.body.appendChild(host)
      const root = ui.createRoot(host)
      root.render(ui.createElement(PublicChrome, { ui }))
      portalHost = host
      portalRoot = root
    }

    const Page = () => ui.createElement(AdminApp, { ui })
    const nav = {
      group: 'SEO',
      path: '/admin/cookie-consent',
      label: 'Cookie Consent',
      permission: 'cookie-consent.view',
      icon: 'cookie',
    }
    const page = {
      path: 'cookie-consent',
      label: 'Cookie Consent',
      group: 'SEO',
      permission: 'cookie-consent.view',
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
  async unregister() {
    try {
      portalRoot?.unmount()
      portalHost?.remove()
    } catch { /* */ }
    portalHost = null
    portalRoot = null
    try { delete window.jaseflyCookieGate } catch { /* */ }
  },
}

export default JaseflyFrontendModule
