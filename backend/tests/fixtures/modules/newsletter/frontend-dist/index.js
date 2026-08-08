/**
 * Newsletter package FE — host admin pages + frozen widget newsletter-signup + dashboard card.
 */
const SLUG = 'newsletter'
const VERSION = '1.0.0'
const API = '/api/v1'

function registerHostAdminPage(ctx, spec) {
  const { path, label, group, permission, hostPageKey, icon } = spec
  const nav = { group, path: `/admin/${path}`, label, permission, icon }
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

function NewsletterSignup({ ui, settings = {}, editMode }) {
  const { createElement: h, useState } = ui
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setStatus('')
    try {
      const res = await fetch(`${API}/newsletter/subscribe`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(form.get('email') || ''),
          name: String(form.get('name') || ''),
          list_id: Number(settings.list_id || 0) || null,
          source: 'widget',
        }),
      })
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* */ }
      if (!res.ok) throw new Error(json?.error || json?.message || text || res.statusText)
      setStatus(String(settings.success_text || 'Проверьте почту для подтверждения подписки.'))
      event.currentTarget.reset()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось подписаться')
    } finally {
      setPending(false)
    }
  }

  return h('div', {
    style: {
      margin: '0 auto',
      maxWidth: 576,
      borderRadius: 'var(--radius, 12px)',
      border: '1px solid var(--border, #3f3f46)',
      padding: 20,
    },
  },
    h('h2', {
      style: { fontFamily: 'var(--font-heading, inherit)', margin: 0, fontSize: 24 },
    }, String(settings.title || 'Подпишитесь на рассылку')),
    h('p', {
      style: { margin: '4px 0 0', fontSize: 14, color: 'var(--muted, #a1a1aa)' },
    }, String(settings.description || 'Новости и полезные материалы без спама.')),
    h('form', {
      onSubmit: submit,
      style: { marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 },
    },
      settings.show_name
        ? h('input', {
          name: 'name',
          placeholder: 'Имя',
          style: {
            minWidth: 160, flex: '1 1 160px', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--border, #3f3f46)', background: 'transparent', color: 'inherit', font: 'inherit',
          },
        })
        : null,
      h('input', {
        name: 'email',
        type: 'email',
        required: true,
        placeholder: 'Email',
        style: {
          minWidth: 220, flex: '1 1 220px', padding: '8px 12px', borderRadius: 8,
          border: '1px solid var(--border, #3f3f46)', background: 'transparent', color: 'inherit', font: 'inherit',
        },
      }),
      h('button', {
        type: 'submit',
        disabled: pending || editMode,
        style: {
          padding: '10px 18px', borderRadius: 8,
          border: '1px solid var(--border, #3f3f46)',
          background: 'var(--primary, #0369a1)', color: '#fff', cursor: 'pointer', font: 'inherit',
        },
      }, pending ? 'Отправка…' : String(settings.button_text || 'Подписаться')),
    ),
    status ? h('p', { style: { marginTop: 8, fontSize: 14, color: 'var(--muted, #a1a1aa)' } }, status) : null,
  )
}

function DashboardCard({ ui }) {
  const { createElement: h, useEffect, useState } = ui
  const [subs, setSubs] = useState(null)
  const [camps, setCamps] = useState(null)
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  useEffect(() => {
    Promise.all([
      fetch(`${API}/admin/newsletter/subscribers`, { credentials: 'same-origin', headers }).then((r) => r.json()),
      fetch(`${API}/admin/newsletter/campaigns`, { credentials: 'same-origin', headers }).then((r) => r.json()),
    ])
      .then(([s, c]) => {
        setSubs(Array.isArray(s?.data) ? s.data : [])
        setCamps(Array.isArray(c?.data) ? c.data : [])
      })
      .catch(() => {
        setSubs([])
        setCamps([])
      })
  }, [])

  const active = (subs || []).filter((s) => s.status === 'active').length
  const sending = (camps || []).filter((c) => c.status === 'sending' || c.status === 'scheduled').length

  return h('div', {
    style: {
      border: '1px solid #27272a',
      borderRadius: 14,
      padding: 16,
      background: 'rgba(24,24,27,.45)',
      color: '#e4e4e7',
    },
  },
    h('p', {
      style: { margin: 0, fontSize: 11, color: '#fb7185', textTransform: 'uppercase', letterSpacing: '0.12em' },
    }, 'Рассылки'),
    h('div', {
      style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 12 },
    },
      [['Подписчики', (subs || []).length], ['Активные', active], ['В очереди', sending]].map(([label, value]) =>
        h('div', { key: label },
          h('div', { style: { fontSize: 11, color: '#71717a', textTransform: 'uppercase' } }, label),
          h('div', { style: { marginTop: 4, fontSize: 22, fontWeight: 650 } }, String(value)),
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
      console.warn('[newsletter] ctx.ui missing')
      return
    }

    registerHostAdminPage(ctx, {
      path: 'newsletter/subscribers',
      label: 'Подписчики',
      group: 'Коммуникации',
      permission: 'newsletter.view',
      hostPageKey: 'newsletter.subscribers',
      icon: 'users',
    })
    registerHostAdminPage(ctx, {
      path: 'newsletter/campaigns',
      label: 'Рассылки',
      group: 'Коммуникации',
      permission: 'newsletter.view',
      hostPageKey: 'newsletter.campaigns',
      icon: 'send',
    })

    const widget = {
      type: 'newsletter-signup',
      label: 'Подписка на рассылку',
      category: 'basic',
      stableType: true,
      defaultSettings: {
        title: 'Подпишитесь на рассылку',
        description: 'Новости и полезные материалы без спама.',
        button_text: 'Подписаться',
        success_text: 'Проверьте почту для подтверждения подписки.',
        list_id: '',
        show_name: false,
      },
      settingsFields: [
        { key: 'title', label: 'Заголовок', type: 'text' },
        { key: 'description', label: 'Описание', type: 'textarea' },
        { key: 'button_text', label: 'Текст кнопки', type: 'text' },
        { key: 'success_text', label: 'Успешная отправка', type: 'text' },
        { key: 'list_id', label: 'ID списка', type: 'number' },
        { key: 'show_name', label: 'Показывать поле имени', type: 'toggle' },
      ],
      Render: (props) => ui.createElement(NewsletterSignup, {
        ui,
        settings: props.settings || {},
        editMode: props.editMode,
      }),
    }
    if (ctx.builder?.registerWidget) ctx.builder.registerWidget(widget)
    else ctx.registerBuilderWidget?.(widget)

    if (ctx.host?.registerSlot) {
      ctx.host.registerSlot(
        'admin.dashboard',
        () => ui.createElement(DashboardCard, { ui }),
        { id: 'pulse', order: 55 },
      )
    } else if (ctx.admin?.registerDashboardCard) {
      ctx.admin.registerDashboardCard({
        id: 'newsletter-pulse',
        label: 'Рассылки',
        render: () => ui.createElement(DashboardCard, { ui }),
      })
    }
  },
  async unregister() {},
}

export default JaseflyFrontendModule
