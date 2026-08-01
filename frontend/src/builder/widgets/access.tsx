import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { AccessRuleEditor } from '@/builder/edit/AccessRuleEditor'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'

function fields(...items: SettingsField[]) {
  return items
}

function DenyShell({
  settings,
}: {
  settings: Record<string, unknown>
}) {
  const mode = String(settings.deny_mode || 'message')
  const message = String(settings.deny_message || 'Контент доступен по подписке или после входа.')
  const ctaLabel = String(settings.deny_cta_label || 'Войти')
  const ctaHref = String(settings.deny_cta_href || '/login')
  const buyLabel = String(settings.deny_buy_label || 'Купить доступ')
  const buyHref = String(settings.deny_buy_href || '/pricing')
  const template = String(settings.deny_template_html || '')

  if (mode === 'hide') return null

  if (mode === 'template' && template.trim()) {
    return (
      <div
        className="rounded-[var(--radius)] border border-white/10 bg-white/[0.03] p-6"
        dangerouslySetInnerHTML={{ __html: template }}
      />
    )
  }

  if (mode === 'stub') {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-[var(--radius)] border border-dashed border-white/15 bg-white/[0.02] p-8 text-sm text-[color:var(--muted)]">
        Закрытый блок
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-[var(--radius)] border border-white/10 bg-white/[0.03] p-6 text-center">
      <p className="text-sm text-[color:var(--text)]">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {(mode === 'login' || mode === 'message') && (
          <Link
            to={ctaHref}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] bg-[color:var(--primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--background)]"
          >
            {ctaLabel}
          </Link>
        )}
        {(mode === 'purchase' || mode === 'message') && (
          <Link
            to={buyHref}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-white/15 px-5 py-2.5 text-sm font-semibold text-[color:var(--text)]"
          >
            {buyLabel}
          </Link>
        )}
      </div>
    </div>
  )
}

function AccessContainerRender({
  settings,
  editMode,
  children,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
  children?: ReactNode
}) {
  const { token } = useAuth()
  const [allowed, setAllowed] = useState<boolean | null>(editMode ? true : null)
  const serverDenied = Boolean(settings._access_denied)

  useEffect(() => {
    if (editMode) {
      setAllowed(true)
      return
    }
    if (serverDenied) {
      setAllowed(false)
      return
    }
    // If server already stripped children for hide mode, we won't mount.
    // For other modes children empty + need client check only when rule present.
    let alive = true
    const rule = settings.rule
    if (!rule) {
      setAllowed(true)
      return
    }
    api.post<{ data?: { allowed?: boolean } }>('/access/can', { rule }, { silent: true })
      .then((res) => {
        if (!alive) return
        setAllowed(Boolean(res?.data?.allowed ?? (res as { allowed?: boolean }).allowed))
      })
      .catch(() => {
        if (!alive) return
        setAllowed(false)
      })
    return () => { alive = false }
  }, [editMode, serverDenied, settings.rule, token])

  if (editMode) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-sky-500/40 bg-sky-500/[0.04] p-3">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-sky-300">
          <span className="rounded bg-sky-500/20 px-1.5 py-0.5">Доступ</span>
          <span className="normal-case tracking-normal text-zinc-400">
            Контент ниже виден по правилу AccessService
          </span>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    )
  }

  if (allowed === null) {
    return <div className="min-h-16 animate-pulse rounded-[var(--radius)] bg-white/[0.03]" />
  }
  if (!allowed || serverDenied) {
    return <DenyShell settings={settings} />
  }
  return <>{children}</>
}

export function registerAccessWidgets() {
  registerWidget({
    type: 'access-container',
    label: 'Доступ',
    category: 'basic',
    icon: 'access-container',
    plugin: 'access',
    keywords: ['access', 'access-container', 'доступ', 'paywall', 'подписка', 'покупка', 'закрытый', 'acc', 'дос'],
    acceptsChildren: true,
    defaultSettings: {
      rule: {
        version: 1,
        op: 'any',
        rules: [{ provider: 'auth', assert: 'authenticated', params: {} }],
      },
      deny_mode: 'message',
      deny_message: 'Этот блок доступен после входа или покупки.',
      deny_cta_label: 'Войти',
      deny_cta_href: '/login',
      deny_buy_label: 'Купить доступ',
      deny_buy_href: '/pricing',
      deny_template_html: '',
    },
    settingsFields: fields(
      {
        key: 'rule',
        label: 'Правило доступа',
        type: 'custom',
        component: AccessRuleEditor,
      },
      {
        key: 'deny_mode',
        label: 'Если нет доступа',
        type: 'select',
        options: [
          { value: 'hide', label: 'Полностью скрыть' },
          { value: 'stub', label: 'Заглушка' },
          { value: 'message', label: 'Сообщение + кнопки' },
          { value: 'login', label: 'Кнопка входа' },
          { value: 'purchase', label: 'Предложение купить' },
          { value: 'template', label: 'Произвольный HTML' },
        ],
      },
      { key: 'deny_message', label: 'Текст сообщения', type: 'textarea' },
      { key: 'deny_cta_label', label: 'Текст кнопки входа', type: 'text' },
      { key: 'deny_cta_href', label: 'Ссылка входа', type: 'url' },
      { key: 'deny_buy_label', label: 'Текст кнопки покупки', type: 'text' },
      { key: 'deny_buy_href', label: 'Ссылка покупки', type: 'url' },
      { key: 'deny_template_html', label: 'HTML шаблон (deny=template)', type: 'code' },
    ),
    Render: AccessContainerRender,
  })
}
