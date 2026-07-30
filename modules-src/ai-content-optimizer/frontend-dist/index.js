/**
 * AI Content Optimizer admin — InstantCMS-like IA, Jasefly dark chrome.
 */
const SLUG = 'ai-content-optimizer'
const VERSION = '1.0.1'
const API = '/api/v1'

const DEFAULT_MODES = {
  title: 'keep',
  seo_title: 'always',
  seo_description: 'always',
  seo_keywords: 'always',
  excerpt: 'always',
  content: 'always',
}

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

function el(ui, type, props, ...children) {
  return ui.createElement(type, props, ...children.flat().filter((c) => c != null && c !== false))
}

const css = {
  page: { maxWidth: 980, color: '#e4e4e7' },
  heroEyebrow: { margin: 0, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#2dd4bf' },
  heroTitle: { margin: '6px 0 8px', fontSize: 26, fontWeight: 650, color: '#fafafa' },
  heroHint: { margin: 0, fontSize: 14, lineHeight: 1.5, color: '#a1a1aa' },
  topNav: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '18px 0 14px' },
  navBtn: (on) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 12,
    border: on ? '1px solid rgba(45,212,191,.35)' : '1px solid #27272a',
    background: on ? 'rgba(19,78,74,.55)' : 'rgba(9,9,11,.6)',
    color: on ? '#ccfbf1' : '#d4d4d8', cursor: 'pointer', font: 'inherit', fontSize: 13,
  }),
  panel: {
    border: '1px solid #27272a', borderRadius: 16, background: 'rgba(24,24,27,.55)',
    padding: 18, marginBottom: 14,
  },
  legend: {
    margin: '-28px 0 14px 8px', display: 'inline-block', padding: '0 8px',
    fontSize: 12, color: '#a1a1aa', background: '#18181b',
  },
  label: { display: 'grid', gap: 6, marginBottom: 14, fontSize: 13, color: '#a1a1aa' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #3f3f46', background: '#09090b', color: '#fafafa', font: 'inherit',
  },
  hint: { margin: '-8px 0 12px', fontSize: 12, color: '#71717a', lineHeight: 1.4 },
  btn: (primary) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10,
    border: primary ? '1px solid rgba(45,212,191,.4)' : '1px solid #3f3f46',
    background: primary ? '#0f766e' : 'transparent', color: primary ? '#ecfdf5' : '#e4e4e7',
    cursor: 'pointer', font: 'inherit', fontSize: 13,
  }),
  toggleRow: {
    display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, padding: '10px 12px',
    borderRadius: 12, border: '1px solid #27272a', background: 'rgba(9,9,11,.45)',
  },
  err: { color: '#fca5a5', marginBottom: 12, fontSize: 13 },
  ok: { color: '#6ee7b7' },
  bad: { color: '#fca5a5' },
  muted: { color: '#71717a' },
}

function Toggle({ ui, checked, onChange, label, hint }) {
  const { createElement: h } = ui
  return h('label', { style: css.toggleRow },
    h('button', {
      type: 'button',
      role: 'switch',
      'aria-checked': !!checked,
      onClick: () => onChange(!checked),
      style: {
        width: 44, height: 24, borderRadius: 999, border: 'none', padding: 2, cursor: 'pointer',
        background: checked ? '#0d9488' : '#3f3f46', position: 'relative', flex: '0 0 auto', marginTop: 2,
      },
    }, h('span', {
      style: {
        display: 'block', width: 20, height: 20, borderRadius: 999, background: '#fff',
        transform: checked ? 'translateX(20px)' : 'translateX(0)', transition: 'transform .15s',
      },
    })),
    h('span', null,
      h('span', { style: { display: 'block', color: '#e4e4e7', fontSize: 14 } }, label),
      hint ? h('span', { style: { display: 'block', marginTop: 4, fontSize: 12, color: '#71717a' } }, hint) : null,
    ),
  )
}

function Field({ ui, label, hint, children }) {
  const { createElement: h } = ui
  return h('label', { style: css.label },
    label,
    children,
    hint ? h('span', { style: css.hint }, hint) : null,
  )
}

function parseModes(profile) {
  let modes = { ...DEFAULT_MODES }
  try {
    const raw = typeof profile.field_modes_json === 'string'
      ? JSON.parse(profile.field_modes_json)
      : (profile.field_modes_json || profile.field_modes)
    if (raw && typeof raw === 'object') modes = { ...modes, ...raw }
  } catch { /* */ }
  if (profile.title_mode) modes.title = profile.title_mode
  return modes
}

function AdminApp({ ui }) {
  const { createElement: h, useState, useEffect, Fragment } = ui
  const [tab, setTab] = useState('profiles')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [meta, setMeta] = useState({ content_types: [], field_modes: [], field_keys: [], prompt_vars: [] })
  const [settings, setSettings] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [log, setLog] = useState([])
  const [edit, setEdit] = useState(null)
  const [editTab, setEditTab] = useState('basic')
  const [detail, setDetail] = useState(null)
  const [showHtml, setShowHtml] = useState(false)

  const reload = () => {
    setError('')
    Promise.all([
      apiFetch('/admin/ai-content-optimizer/meta'),
      apiFetch('/admin/ai-content-optimizer/settings'),
      apiFetch('/admin/ai-content-optimizer/profiles'),
      apiFetch('/admin/ai-content-optimizer/log?limit=60'),
    ]).then(([m, s, p, l]) => {
      setMeta(m || {})
      setSettings(s || {})
      setProfiles(Array.isArray(p) ? p : [])
      setLog(Array.isArray(l) ? l : [])
    }).catch((e) => setError(e.message))
  }
  useEffect(reload, [])

  const saveSettings = () => {
    setBusy(true)
    apiFetch('/admin/ai-content-optimizer/settings', { method: 'PUT', body: JSON.stringify(settings) })
      .then((s) => { setSettings(s); alert('Настройки сохранены') })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const openProfile = (p) => {
    const modes = parseModes(p || {})
    setEdit({
      id: p?.id,
      name: p?.name || 'Новый профиль',
      content_type: p?.content_type || 'blog',
      body_field: p?.body_field || 'content',
      excerpt_field: p?.excerpt_field || 'excerpt',
      batch_limit: p?.batch_limit ?? 1,
      scan_limit: p?.scan_limit ?? 50,
      reupdate_days: p?.reupdate_days ?? 180,
      interval_hours: p?.interval_hours ?? 24,
      published_only: Number(p?.published_only ?? 1),
      scheduler_enabled: Number(p?.scheduler_enabled ?? 1),
      is_active: Number(p?.is_active ?? 1),
      protect_slug: Number(p?.protect_slug ?? 1),
      min_source_chars: p?.min_source_chars ?? 300,
      min_result_chars: p?.min_result_chars ?? (p?.min_chars ?? 800),
      min_growth_pct: p?.min_growth_pct ?? 10,
      require_preserve: Number(p?.require_preserve ?? 1),
      append_updated_note: Number(p?.append_updated_note ?? 1),
      prompt: p?.prompt || '',
      field_modes: modes,
    })
    setEditTab('basic')
    setTab('profiles')
  }

  const saveProfile = () => {
    if (!edit) return
    setBusy(true)
    const body = {
      ...edit,
      field_modes_json: edit.field_modes,
      title_mode: edit.field_modes?.title || 'keep',
      min_chars: edit.min_result_chars,
    }
    const req = edit.id
      ? apiFetch(`/admin/ai-content-optimizer/profiles/${edit.id}`, { method: 'PUT', body: JSON.stringify(body) })
      : apiFetch('/admin/ai-content-optimizer/profiles', { method: 'POST', body: JSON.stringify(body) })
    req.then(() => { setEdit(null); reload() })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const runProfile = (id) => {
    setBusy(true)
    apiFetch('/admin/ai-content-optimizer/run', {
      method: 'POST',
      body: JSON.stringify({ profile_id: id || undefined }),
    }).then((r) => {
      alert(`Готово: ok ${r.ok}, skip ${r.skipped}, err ${r.errors}`)
      reload()
      setTab('log')
    }).catch((e) => setError(e.message)).finally(() => setBusy(false))
  }

  const openLog = (id) => {
    apiFetch(`/admin/ai-content-optimizer/log/${id}`)
      .then((d) => { setDetail(d); setShowHtml(false) })
      .catch((e) => setError(e.message))
  }

  if (!settings) {
    return h('div', { style: { ...css.page, padding: 24 } }, error || 'Загрузка…')
  }

  const fieldKeys = meta.field_keys?.length
    ? meta.field_keys
    : Object.keys(DEFAULT_MODES).map((id) => ({ id, label: id }))
  const modeOpts = meta.field_modes?.length
    ? meta.field_modes
    : [
      { id: 'keep', label: 'Не изменять' },
      { id: 'always', label: 'Изменять всегда' },
      { id: 'if_better', label: 'Изменять только если лучше' },
    ]

  // —— Log detail view ——
  if (detail?.log) {
    const log = detail.log
    const fields = detail.result?.fields || []
    const before = detail.result?.before
      || (detail.backup?.before_json ? (typeof detail.backup.before_json === 'string' ? JSON.parse(detail.backup.before_json) : detail.backup.before_json) : {})
    const applied = detail.result?.applied
      || (detail.backup?.after_json ? (typeof detail.backup.after_json === 'string' ? JSON.parse(detail.backup.after_json) : detail.backup.after_json) : {})
    const ok = log.status === 'ok'
    return h('div', { style: css.page },
      h('button', { type: 'button', style: { ...css.btn(false), marginBottom: 14 }, onClick: () => setDetail(null) }, '← К журналу'),
      h('div', { style: { ...css.panel, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' } },
        h('div', null,
          h('span', {
            style: {
              display: 'inline-block', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: ok ? 'rgba(16,185,129,.15)' : 'rgba(244,63,94,.12)',
              color: ok ? '#6ee7b7' : '#fda4af', border: `1px solid ${ok ? 'rgba(16,185,129,.35)' : 'rgba(244,63,94,.3)'}`,
            },
          }, ok ? 'Статья обновлена' : (log.status === 'skipped' ? 'Пропущено' : 'Ошибка')),
          h('div', { style: { marginTop: 10, fontSize: 13, color: '#a1a1aa' } },
            `${log.created_at || ''} · ${log.content_title || ''} · ${log.model_used || '—'}`),
          log.message ? h('div', { style: { marginTop: 6, fontSize: 13, color: '#d4d4d8' } }, log.message) : null,
        ),
        log.public_url ? h('a', {
          href: log.public_url, target: '_blank', rel: 'noreferrer', style: css.btn(true),
        }, 'Открыть обновлённую статью') : null,
      ),
      fields.length ? h('div', { style: css.panel },
        h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
          h('thead', null, h('tr', { style: { color: '#71717a', textAlign: 'left' } },
            ['Поле', 'Было', 'Предложено AI', 'Результат'].map((c) =>
              h('th', { key: c, style: { padding: '8px 6px', borderBottom: '1px solid #27272a', fontWeight: 500 } }, c)),
          )),
          h('tbody', null, fields.filter((f) => f.key !== 'content').map((f) => h('tr', { key: f.key },
            h('td', { style: { padding: '10px 6px', borderBottom: '1px solid #18181b', color: '#d4d4d8', verticalAlign: 'top' } }, f.label || f.key),
            h('td', { style: { padding: '10px 6px', borderBottom: '1px solid #18181b', color: '#a1a1aa', verticalAlign: 'top', maxWidth: 180 } }, (f.old || '—').slice(0, 160)),
            h('td', { style: { padding: '10px 6px', borderBottom: '1px solid #18181b', color: '#d4d4d8', verticalAlign: 'top', maxWidth: 180 } }, (f.proposed || '—').slice(0, 160)),
            h('td', { style: { padding: '10px 6px', borderBottom: '1px solid #18181b', verticalAlign: 'top' } },
              h('span', { style: f.status === 'applied' ? css.ok : css.bad },
                f.status === 'applied' ? 'Применено' : 'Не применено'),
              f.note ? h('div', { style: { ...css.muted, fontSize: 11, marginTop: 4 } }, f.note) : null,
            ),
          ))),
        ),
      ) : null,
      h('button', { type: 'button', style: { ...css.btn(false), marginBottom: 12 }, onClick: () => setShowHtml((v) => !v) },
        showHtml ? 'Скрыть HTML-код' : 'Показать / скрыть HTML-код'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
        h('div', { style: css.panel },
          h('h3', { style: { marginTop: 0, fontSize: 14, color: '#a1a1aa' } }, 'Старый текст'),
          showHtml
            ? h('pre', { style: { margin: 0, whiteSpace: 'pre-wrap', fontSize: 11, color: '#a1a1aa', maxHeight: 480, overflow: 'auto' } }, before?.content || '—')
            : h('div', {
              style: { fontSize: 13, lineHeight: 1.55, color: '#d4d4d8', maxHeight: 480, overflow: 'auto' },
              dangerouslySetInnerHTML: { __html: before?.content || '<p>—</p>' },
            }),
        ),
        h('div', { style: css.panel },
          h('h3', { style: { marginTop: 0, fontSize: 14, color: '#a1a1aa' } }, 'Новый текст'),
          showHtml
            ? h('pre', { style: { margin: 0, whiteSpace: 'pre-wrap', fontSize: 11, color: '#a1a1aa', maxHeight: 480, overflow: 'auto' } }, applied?.content || '—')
            : h('div', {
              style: { fontSize: 13, lineHeight: 1.55, color: '#d4d4d8', maxHeight: 480, overflow: 'auto' },
              dangerouslySetInnerHTML: { __html: applied?.content || '<p>—</p>' },
            }),
        ),
      ),
    )
  }

  // —— Profile editor ——
  if (edit) {
    return h('div', { style: css.page },
      h('div', { style: { display: 'flex', gap: 10, marginBottom: 14 } },
        h('button', { type: 'button', style: css.btn(true), disabled: busy, onClick: saveProfile }, 'Сохранить'),
        h('button', { type: 'button', style: { ...css.btn(false), color: '#fca5a5' }, onClick: () => setEdit(null) }, 'Отменить'),
      ),
      h('div', { style: css.topNav },
        [['basic', 'Основные настройки'], ['checks', 'Обновляемые данные и проверки']].map(([id, label]) =>
          h('button', { key: id, type: 'button', style: css.navBtn(editTab === id), onClick: () => setEditTab(id) }, label)),
      ),
      error ? h('p', { style: css.err }, error) : null,

      editTab === 'basic' ? h('div', { style: css.panel },
        h(Field, { ui, label: 'Название профиля *' },
          h('input', { style: css.input, value: edit.name, onChange: (e) => setEdit({ ...edit, name: e.target.value }) })),
        h(Field, { ui, label: 'Тип контента' },
          h('select', {
            style: css.input, value: edit.content_type,
            onChange: (e) => setEdit({ ...edit, content_type: e.target.value }),
          }, (meta.content_types || []).map((t) => h('option', { key: t.id, value: t.id }, t.label)))),
        h(Field, { ui, label: 'Поле полного текста', hint: 'Логическое поле body для AI (обычно content / description)' },
          h('input', { style: css.input, value: edit.body_field, onChange: (e) => setEdit({ ...edit, body_field: e.target.value }) })),
        h(Field, { ui, label: 'Поле анонса' },
          h('input', { style: css.input, value: edit.excerpt_field, onChange: (e) => setEdit({ ...edit, excerpt_field: e.target.value }) })),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h(Field, { ui, label: 'Статей за один запуск' },
            h('input', { type: 'number', style: css.input, value: edit.batch_limit, onChange: (e) => setEdit({ ...edit, batch_limit: Number(e.target.value || 1) }) })),
          h(Field, { ui, label: 'Сколько записей просматривать за запуск' },
            h('input', { type: 'number', style: css.input, value: edit.scan_limit, onChange: (e) => setEdit({ ...edit, scan_limit: Number(e.target.value || 50) }) })),
        ),
        h(Field, { ui, label: 'Повторно обновлять через (дней)', hint: 'Интервал между запусками профиля задаётся также в часах ниже для cron' },
          h('input', { type: 'number', style: css.input, value: edit.reupdate_days, onChange: (e) => setEdit({ ...edit, reupdate_days: Number(e.target.value || 180) }) })),
        h(Field, { ui, label: 'Пауза между запусками профиля (часы)' },
          h('input', { type: 'number', style: css.input, value: edit.interval_hours, onChange: (e) => setEdit({ ...edit, interval_hours: Number(e.target.value || 24) }) })),
        h(Toggle, { ui, checked: !!edit.published_only, label: 'Обрабатывать только опубликованные записи',
          onChange: (v) => setEdit({ ...edit, published_only: v ? 1 : 0 }) }),
        h(Toggle, { ui, checked: !!edit.scheduler_enabled, label: 'Включить профиль в планировщике',
          onChange: (v) => setEdit({ ...edit, scheduler_enabled: v ? 1 : 0 }) }),
        h(Toggle, { ui, checked: !!edit.is_active, label: 'Профиль активен',
          onChange: (v) => setEdit({ ...edit, is_active: v ? 1 : 0 }) }),
      ) : h('div', { style: css.panel },
        fieldKeys.map((fk) => h(Field, { key: fk.id, ui, label: fk.label || fk.id },
          h('select', {
            style: css.input,
            value: edit.field_modes?.[fk.id] || 'keep',
            onChange: (e) => setEdit({
              ...edit,
              field_modes: { ...edit.field_modes, [fk.id]: e.target.value },
            }),
          }, modeOpts.map((o) => h('option', { key: o.id, value: o.id }, o.label))),
        )),
        h(Toggle, {
          ui, checked: !!edit.protect_slug,
          label: 'Никогда не изменять URL (slug)',
          hint: 'Рекомендуется для сохранения существующих адресов и SEO-позиций',
          onChange: (v) => setEdit({ ...edit, protect_slug: v ? 1 : 0 }),
        }),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } },
          h(Field, { ui, label: 'Минимальная длина исходника без HTML' },
            h('input', { type: 'number', style: css.input, value: edit.min_source_chars,
              onChange: (e) => setEdit({ ...edit, min_source_chars: Number(e.target.value || 0) }) })),
          h(Field, { ui, label: 'Минимальная длина результата без HTML' },
            h('input', { type: 'number', style: css.input, value: edit.min_result_chars,
              onChange: (e) => setEdit({ ...edit, min_result_chars: Number(e.target.value || 0) }) })),
          h(Field, { ui, label: 'Минимальное увеличение объёма, %', hint: 'Результат также не может быть короче исходного' },
            h('input', { type: 'number', style: css.input, value: edit.min_growth_pct,
              onChange: (e) => setEdit({ ...edit, min_growth_pct: Number(e.target.value || 0) }) })),
        ),
        h(Toggle, { ui, checked: !!edit.require_preserve, label: 'Обязательное сохранение исходной информации',
          onChange: (v) => setEdit({ ...edit, require_preserve: v ? 1 : 0 }) }),
        h(Toggle, { ui, checked: !!edit.append_updated_note, label: 'Добавлять отметку «Информация обновлена»',
          onChange: (v) => setEdit({ ...edit, append_updated_note: v ? 1 : 0 }) }),
        h(Field, {
          ui, label: 'Промт',
          hint: `Переменные: ${(meta.prompt_vars || []).join(' ')}`,
        }, h('textarea', {
          rows: 10, style: { ...css.input, fontFamily: 'ui-monospace, monospace', fontSize: 12 },
          value: edit.prompt,
          onChange: (e) => setEdit({ ...edit, prompt: e.target.value }),
        })),
      ),
    )
  }

  // —— Main shell ——
  return h('div', { style: css.page },
    h('p', { style: css.heroEyebrow }, 'Модуль'),
    h('h1', { style: css.heroTitle }, 'AI Content Optimizer'),
    h('p', { style: css.heroHint },
      'SEO-обновление опубликованных материалов через OpenRouter. Профили, проверки качества, резервные копии и журнал — в стиле Jasefly.'),

    h('div', { style: css.topNav },
      [
        ['profiles', 'Профили обновления'],
        ['settings', 'Настройки'],
        ['log', 'Лог'],
      ].map(([id, label]) => h('button', {
        key: id, type: 'button', style: css.navBtn(tab === id), onClick: () => setTab(id),
      }, label)),
    ),
    error ? h('p', { style: css.err }, error) : null,

    tab === 'settings' ? h(Fragment, null,
      h('div', { style: { marginBottom: 12 } },
        h('button', { type: 'button', style: css.btn(true), disabled: busy, onClick: saveSettings }, 'Сохранить')),
      h('fieldset', { style: { ...css.panel, border: '1px solid #27272a' } },
        h('legend', { style: css.legend }, 'OpenRouter'),
        h(Field, { ui, label: 'API-ключи', hint: 'Один ключ на строку. При ошибке ключ пропускается.' },
          h('textarea', {
            rows: 4, style: css.input, value: settings.api_keys || '',
            placeholder: 'sk-or-v1-…',
            onChange: (e) => setSettings({ ...settings, api_keys: e.target.value }),
          })),
        h(Field, { ui, label: 'Модели', hint: 'Одна модель на строку. При ошибке компонент автоматически переходит к следующей.' },
          h('textarea', {
            rows: 7, style: css.input, value: settings.models || '',
            onChange: (e) => setSettings({ ...settings, models: e.target.value }),
          })),
        h(Field, { ui, label: 'HTTP-прокси', hint: 'Например: 127.0.0.1:8080' },
          h('input', {
            style: css.input, value: settings.proxy || '',
            onChange: (e) => setSettings({ ...settings, proxy: e.target.value }),
          })),
        h(Field, { ui, label: 'Логин и пароль прокси', hint: 'Формат: login:password' },
          h('input', {
            style: css.input, value: settings.proxy_auth || '',
            onChange: (e) => setSettings({ ...settings, proxy_auth: e.target.value }),
          })),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h(Field, { ui, label: 'Temperature' },
            h('input', {
              type: 'number', step: '0.1', min: 0, max: 2, style: css.input,
              value: settings.temperature ?? 0.4,
              onChange: (e) => setSettings({ ...settings, temperature: Number(e.target.value) }),
            })),
          h(Field, { ui, label: 'Максимум токенов ответа' },
            h('input', {
              type: 'number', style: css.input, value: settings.max_tokens ?? 6000,
              onChange: (e) => setSettings({ ...settings, max_tokens: Number(e.target.value || 6000) }),
            })),
        ),
        h(Toggle, {
          ui, checked: !!Number(settings.web_search),
          label: 'Проверять актуальность через веб-поиск OpenRouter',
          onChange: (v) => setSettings({ ...settings, web_search: v ? 1 : 0 }),
        }),
        h(Toggle, {
          ui, checked: !!Number(settings.cron_enabled),
          label: 'Глобальный cron (нужен модуль Scheduler)',
          hint: 'Тик раз в час обрабатывает активные профили с включённым планировщиком',
          onChange: (v) => setSettings({ ...settings, cron_enabled: v ? 1 : 0 }),
        }),
        h(Field, { ui, label: 'Промт по умолчанию (если в профиле пусто)' },
          h('textarea', {
            rows: 5, style: css.input, value: settings.default_prompt || '',
            onChange: (e) => setSettings({ ...settings, default_prompt: e.target.value }),
          })),
      ),
    ) : null,

    tab === 'profiles' ? h(Fragment, null,
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' } },
        h('button', { type: 'button', style: css.btn(true), onClick: () => openProfile(null) }, 'Добавить профиль'),
        h('button', { type: 'button', style: css.btn(false), disabled: busy, onClick: () => runProfile(null) }, 'Запустить все активные'),
      ),
      profiles.length === 0
        ? h('div', { style: css.panel }, h('p', { style: css.muted }, 'Профилей пока нет — создайте первый.'))
        : h('div', { style: { display: 'grid', gap: 10 } },
          profiles.map((p) => h('div', {
            key: p.id, style: {
              ...css.panel, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap',
            },
          },
            h('div', null,
              h('div', { style: { fontWeight: 600, color: '#fafafa' } }, p.name),
              h('div', { style: { marginTop: 4, fontSize: 12, color: '#71717a' } },
                `${p.content_type} · ${Number(p.is_active) ? 'активен' : 'выкл'} · batch ${p.batch_limit} · scan ${p.scan_limit || 50} · каждые ${p.interval_hours}ч`),
            ),
            h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              h('button', { type: 'button', style: css.btn(false), onClick: () => openProfile(p) }, 'Изменить'),
              h('button', { type: 'button', style: css.btn(true), disabled: busy, onClick: () => runProfile(p.id) }, 'Запуск'),
              h('button', {
                type: 'button', style: { ...css.btn(false), color: '#fca5a5' },
                onClick: () => {
                  if (!confirm('Удалить профиль?')) return
                  apiFetch(`/admin/ai-content-optimizer/profiles/${p.id}`, { method: 'DELETE' })
                    .then(reload).catch((e) => setError(e.message))
                },
              }, 'Удалить'),
            ),
          )),
        ),
    ) : null,

    tab === 'log' ? h('div', { style: css.panel },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 12 } },
        h('h2', { style: { margin: 0, fontSize: 16, color: '#f4f4f5' } }, 'Журнал обработки'),
        h('button', { type: 'button', style: css.btn(false), onClick: reload }, 'Обновить'),
      ),
      log.length === 0
        ? h('p', { style: css.muted }, 'Пока пусто')
        : h('div', { style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
            h('thead', null, h('tr', { style: { color: '#71717a', textAlign: 'left' } },
              ['Дата', 'Статус', 'Материал', 'Модель', ''].map((c) =>
                h('th', { key: c, style: { padding: '8px 6px', borderBottom: '1px solid #27272a', fontWeight: 500 } }, c)),
            )),
            h('tbody', null, log.map((row) => h('tr', { key: row.id },
              h('td', { style: { padding: '10px 6px', borderBottom: '1px solid #18181b', whiteSpace: 'nowrap', color: '#a1a1aa' } }, row.created_at || '—'),
              h('td', {
                style: {
                  padding: '10px 6px', borderBottom: '1px solid #18181b',
                  color: row.status === 'ok' ? '#6ee7b7' : row.status === 'skipped' ? '#fcd34d' : '#fca5a5',
                },
              }, row.status),
              h('td', { style: { padding: '10px 6px', borderBottom: '1px solid #18181b', color: '#d4d4d8' } },
                `${row.content_type}#${row.content_id} — ${row.content_title || ''}`),
              h('td', { style: { padding: '10px 6px', borderBottom: '1px solid #18181b', fontFamily: 'ui-monospace,monospace', fontSize: 11, color: '#a1a1aa' } },
                row.model_used || '—'),
              h('td', { style: { padding: '10px 6px', borderBottom: '1px solid #18181b' } },
                h('button', { type: 'button', style: { ...css.btn(false), padding: '4px 10px', fontSize: 12 }, onClick: () => openLog(row.id) }, 'Открыть')),
            ))),
          ),
        ),
    ) : null,
  )
}

export const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,
  async register(ctx) {
    const ui = ctx.ui
    if (!ui?.createElement) {
      console.warn('[ai-content-optimizer] ctx.ui missing')
      return
    }
    const Page = () => ui.createElement(AdminApp, { ui })
    const nav = {
      group: 'Контент',
      path: '/admin/ai-content-optimizer',
      label: 'AI Optimizer',
      permission: 'ai-content-optimizer.view',
      icon: 'sparkles',
    }
    const page = {
      path: 'ai-content-optimizer',
      label: 'AI Content Optimizer',
      group: 'Контент',
      permission: 'ai-content-optimizer.view',
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
