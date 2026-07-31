/**
 * IndexNow admin — Jasefly dark chrome + one-click setup.
 */
const SLUG = 'indexnow'
const VERSION = '1.0.1'
const API = '/api/v1'

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

const css = {
  page: { maxWidth: 880, color: '#e4e4e7', paddingBottom: 40 },
  eyebrow: { margin: 0, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#38bdf8' },
  title: { margin: '6px 0 8px', fontSize: 26, fontWeight: 650, color: '#fafafa' },
  hint: { margin: 0, fontSize: 14, lineHeight: 1.55, color: '#a1a1aa', maxWidth: 640 },
  panel: {
    border: '1px solid #27272a', borderRadius: 16, background: 'rgba(24,24,27,.55)',
    padding: 18, marginBottom: 14,
  },
  label: { display: 'grid', gap: 6, marginBottom: 14, fontSize: 13, color: '#a1a1aa' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #3f3f46', background: '#09090b', color: '#fafafa', font: 'inherit',
  },
  btn: (primary, danger) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '9px 14px', borderRadius: 10,
    border: danger
      ? '1px solid rgba(248,113,113,.35)'
      : primary
        ? '1px solid rgba(56,189,248,.4)'
        : '1px solid #3f3f46',
    background: danger ? 'transparent' : primary ? '#0369a1' : 'transparent',
    color: danger ? '#fca5a5' : primary ? '#e0f2fe' : '#e4e4e7',
    cursor: 'pointer', font: 'inherit', fontSize: 13,
  }),
  muted: { color: '#71717a', fontSize: 12, lineHeight: 1.45 },
  ok: { color: '#6ee7b7' },
  bad: { color: '#fca5a5' },
  row: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12 },
  link: { color: '#7dd3fc', textDecoration: 'underline', textUnderlineOffset: 3 },
}

function Field({ ui, label, hint, children }) {
  const { createElement: h } = ui
  return h('label', { style: css.label },
    label,
    children,
    hint ? h('span', { style: css.muted }, hint) : null,
  )
}

function StatusBadge({ ui, ready }) {
  const { createElement: h } = ui
  return h('span', {
    style: {
      alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
      background: ready ? 'rgba(16,185,129,.15)' : 'rgba(251,191,36,.12)',
      color: ready ? '#6ee7b7' : '#fcd34d',
      border: `1px solid ${ready ? 'rgba(16,185,129,.35)' : 'rgba(251,191,36,.3)'}`,
    },
  }, ready ? 'Готово' : 'Setup')
}

function AdminApp({ ui }) {
  const { createElement: h, useState, useEffect } = ui
  const [status, setStatus] = useState(null)
  const [settings, setSettings] = useState(null)
  const [log, setLog] = useState([])
  const [urlsText, setUrlsText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const reload = () => {
    setError('')
    return Promise.all([
      apiFetch('/admin/indexnow/status'),
      apiFetch('/admin/indexnow/settings'),
      apiFetch('/admin/indexnow/log'),
    ]).then(([st, s, l]) => {
      setStatus(st || {})
      setSettings(s || {})
      setLog(Array.isArray(l) ? l : [])
      return st
    }).catch((e) => { setError(e.message); throw e })
  }
  useEffect(() => { reload().catch(() => {}) }, [])

  const save = () => {
    if (!settings) return
    setBusy(true)
    setMsg('')
    setError('')
    apiFetch('/admin/indexnow/settings', {
      method: 'PUT',
      body: JSON.stringify({
        ...settings,
        endpoints: typeof settings.endpoints === 'string'
          ? settings.endpoints
          : (settings.endpoints || []).join('\n'),
      }),
    }).then((s) => {
      setSettings(s)
      setMsg('Сохранено')
      return reload()
    }).catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const generateKey = () => {
    setBusy(true)
    setMsg('')
    setError('')
    apiFetch('/admin/indexnow/generate-key', { method: 'POST', body: '{}' })
      .then((s) => { setSettings(s); setMsg('Ключ сгенерирован'); return reload() })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const placeKey = () => {
    setBusy(true)
    setMsg('')
    setError('')
    apiFetch('/admin/indexnow/place-key', { method: 'POST', body: '{}' })
      .then((st) => {
        setStatus(st)
        setMsg(st?.key_file_content_ok
          ? 'Файл ключа записан в корень сайта'
          : 'Не удалось записать файл — проверьте права на корень сайта')
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  /** One-click: key + host + file + save */
  const quickSetup = () => {
    setBusy(true)
    setMsg('')
    setError('')
    apiFetch('/admin/indexnow/setup', { method: 'POST', body: '{}' })
      .then((data) => {
        setSettings(data.settings || data)
        setStatus(data.status || null)
        setMsg(data.status?.ready
          ? 'Готово: ключ создан, файл в корне, можно отправлять URL'
          : (data.message || 'Настройка выполнена — проверьте статус файла ключа'))
        return reload()
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const submitUrls = (all) => {
    setBusy(true)
    setMsg('')
    setError('')
    const req = all
      ? apiFetch('/admin/indexnow/submit-all', { method: 'POST', body: '{}' })
      : apiFetch('/admin/indexnow/submit', {
        method: 'POST',
        body: JSON.stringify({
          urls: urlsText.split(/\r?\n/).map((u) => u.trim()).filter(Boolean),
        }),
      })
    req.then((r) => {
      const lines = (r.results || []).map((x) => `${x.endpoint}: HTTP ${x.status}${x.ok ? ' ✓' : ' ✗'}`).join(' · ')
      setMsg(`Отправлено URL: ${r.submitted || 0}. ${lines || (r.ok ? 'OK' : (r.error || 'ошибка'))}`)
      return reload()
    }).catch((e) => setError(e.message)).finally(() => setBusy(false))
  }

  if (!settings) {
    return h('div', { style: { ...css.page, padding: 24 } }, error || 'Загрузка…')
  }

  const endpointsText = Array.isArray(settings.endpoints)
    ? settings.endpoints.join('\n')
    : String(settings.endpoints || '')

  const ready = !!status?.ready
  const keyUrl = settings.key_file_url || ''

  return h('div', { style: css.page },
    h('p', { style: css.eyebrow }, 'SEO'),
    h('h1', { style: css.title }, 'IndexNow'),
    h('p', { style: css.hint },
      'Уведомляйте Яндекс и другие поисковики о новых, обновлённых и удалённых страницах без ожидания обхода. Ключ верификации размещается в корне сайта.'),

    error ? h('p', { style: { ...css.bad, marginBottom: 12 } }, error) : null,
    msg ? h('p', { style: { ...css.ok, marginBottom: 12 } }, msg) : null,

    h('div', { style: css.panel },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 } },
        h('div', { style: { minWidth: 0, flex: '1 1 240px' } },
          h('div', { style: { fontWeight: 600, color: '#fafafa', fontSize: 16 } },
            ready ? 'Готово к отправке' : 'Нужна настройка'),
          h('div', { style: { ...css.muted, marginTop: 6 } },
            status?.key_file_content_ok
              ? h('span', null,
                'Файл ключа: ',
                h('a', { href: keyUrl, target: '_blank', rel: 'noreferrer', style: css.link }, keyUrl || '—'),
              )
              : 'Файл ключа ещё не подтверждён в корне сайта'),
        ),
        h(StatusBadge, { ui, ready }),
      ),
      !ready
        ? h('div', { style: { ...css.row, marginBottom: 10 } },
          h('button', {
            type: 'button',
            style: css.btn(true),
            disabled: busy,
            onClick: quickSetup,
          }, busy ? 'Настраиваю…' : 'Настроить за меня'),
        )
        : null,
      h('p', { style: css.muted },
        'По спецификации IndexNow имя файла = ключ (например /YourKey.txt), внутри — тот же ключ UTF-8 без HTML. Для каждого поддомена — отдельный ключ.'),
    ),

    h('div', { style: css.panel },
      h(Field, { ui, label: 'Ключ (8–128: a-z A-Z 0-9 -)' },
        h('input', {
          style: { ...css.input, ...css.mono }, value: settings.api_key || '',
          onChange: (e) => setSettings({ ...settings, api_key: e.target.value }),
        })),
      h('div', { style: css.row },
        h('button', { type: 'button', style: css.btn(true), disabled: busy, onClick: generateKey }, 'Сгенерировать ключ'),
        h('button', { type: 'button', style: css.btn(false), disabled: busy, onClick: placeKey }, 'Записать файл в корень'),
      ),
      h(Field, { ui, label: 'Host (без схемы)', hint: `Сайт: ${settings.site_origin || '—'}` },
        h('input', {
          style: css.input, value: settings.host || '',
          placeholder: 'www.example.com',
          onChange: (e) => setSettings({ ...settings, host: e.target.value }),
        })),
      h(Field, {
        ui, label: 'Endpoints (по одному на строку)',
        hint: 'По умолчанию: yandex.com/indexnow и api.indexnow.org/indexnow',
      }, h('textarea', {
        rows: 3, style: { ...css.input, ...css.mono }, value: endpointsText,
        onChange: (e) => setSettings({ ...settings, endpoints: e.target.value }),
      })),
      h('label', {
        style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, color: '#d4d4d8', fontSize: 14 },
      },
        h('input', {
          type: 'checkbox',
          checked: !!Number(settings.auto_submit),
          onChange: (e) => setSettings({ ...settings, auto_submit: e.target.checked ? 1 : 0 }),
        }),
        'Автоотправка при публикации / обновлении / удалении контента',
      ),
      h('button', { type: 'button', style: css.btn(true), disabled: busy, onClick: save }, 'Сохранить'),
    ),

    h('div', { style: css.panel },
      h('h2', { style: { marginTop: 0, fontSize: 16, color: '#f4f4f5' } }, 'Отправить URL'),
      h(Field, {
        ui, label: 'Список URL (по одному на строку)',
        hint: 'Или нажмите «Отправить все опубликованные» — соберёт страницы, блог, проекты, товары',
      },
        h('textarea', {
          rows: 5, style: { ...css.input, ...css.mono }, value: urlsText,
          placeholder: 'https://example.com/\nhttps://example.com/blog/post',
          onChange: (e) => setUrlsText(e.target.value),
        })),
      h('div', { style: css.row },
        h('button', {
          type: 'button', style: css.btn(true), disabled: busy || !ready,
          onClick: () => submitUrls(false),
        }, 'Отправить список'),
        h('button', {
          type: 'button', style: css.btn(false), disabled: busy || !ready,
          onClick: () => submitUrls(true),
        }, 'Отправить все опубликованные'),
      ),
      !ready ? h('p', { style: css.muted }, 'Сначала завершите настройку ключа.') : null,
    ),

    h('div', { style: css.panel },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' } },
        h('h2', { style: { margin: 0, fontSize: 16, color: '#f4f4f5' } }, 'Журнал'),
        h('button', {
          type: 'button', style: css.btn(false, true), disabled: busy || log.length === 0,
          onClick: () => {
            if (!confirm('Очистить журнал?')) return
            apiFetch('/admin/indexnow/clear-log', { method: 'POST', body: '{}' })
              .then(reload).catch((e) => setError(e.message))
          },
        }, 'Очистить'),
      ),
      log.length === 0
        ? h('p', { style: css.muted }, 'Пока пусто')
        : h('div', { style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
            h('thead', null, h('tr', { style: { color: '#71717a', textAlign: 'left' } },
              ['Время', 'Endpoint', 'HTTP', 'URL', 'Источник'].map((c) =>
                h('th', { key: c, style: { padding: '8px 6px', borderBottom: '1px solid #27272a', fontWeight: 500 } }, c)),
            )),
            h('tbody', null, log.map((row) => h('tr', { key: row.id },
              h('td', { style: { padding: '8px 6px', borderBottom: '1px solid #18181b', color: '#a1a1aa', whiteSpace: 'nowrap' } }, row.created_at || '—'),
              h('td', { style: { padding: '8px 6px', borderBottom: '1px solid #18181b', ...css.mono, color: '#d4d4d8' } }, row.endpoint || '—'),
              h('td', {
                style: {
                  padding: '8px 6px', borderBottom: '1px solid #18181b',
                  color: Number(row.ok) ? '#6ee7b7' : '#fca5a5',
                },
              }, row.http_status),
              h('td', { style: { padding: '8px 6px', borderBottom: '1px solid #18181b', color: '#a1a1aa' } }, row.url_count),
              h('td', { style: { padding: '8px 6px', borderBottom: '1px solid #18181b', color: '#71717a' } }, row.source || '—'),
            ))),
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
      console.warn('[indexnow] ctx.ui missing')
      return
    }
    const Page = () => ui.createElement(AdminApp, { ui })
    const nav = {
      group: 'SEO',
      path: '/admin/indexnow',
      label: 'IndexNow',
      permission: 'indexnow.view',
      icon: 'radar',
    }
    const page = {
      path: 'indexnow',
      label: 'IndexNow',
      group: 'SEO',
      permission: 'indexnow.view',
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
