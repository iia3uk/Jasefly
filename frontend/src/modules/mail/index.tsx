import { createElement, useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { registerModule } from '@/core/moduleRegistry'
import type { PluginState } from '@/core/moduleRegistry'
import { useHydratedForm } from '@/admin/hooks/useAdminFormGuards'

type MailConfig = {
  captcha_provider: string
  turnstile_site_key: string
  smartcaptcha_site_key: string
  success_message: string
}

const PRESETS: Record<string, { host: string; port: number; encryption: string }> = {
  mailru: { host: 'smtp.mail.ru', port: 465, encryption: 'ssl' },
  yandex: { host: 'smtp.yandex.ru', port: 465, encryption: 'ssl' },
  gmail: { host: 'smtp.gmail.com', port: 587, encryption: 'tls' },
  beget: { host: 'smtp.beget.com', port: 465, encryption: 'ssl' },
}

export function MailSettingsPage() {
  const client = useQueryClient()
  const { data: plugin, isLoading } = useQuery({
    queryKey: ['admin', 'plugins', 'mail'],
    queryFn: async () => {
      const res = await api.get<{ data: PluginState[] }>('/admin/plugins')
      const list = (res as { data?: PluginState[] })?.data ?? []
      return list.find((p) => p.name === 'mail') ?? null
    },
  })

  const { form: values, setForm: setValues } = useHydratedForm<Record<string, unknown>>(
    plugin?.settings ?? null,
    plugin ? 'mail' : 'mail-pending',
  )
  const [msg, setMsg] = useState('')

  const save = useMutation({
    mutationFn: (settings: Record<string, unknown>) =>
      api.put(`/admin/plugins/mail/settings`, { settings }),
    onSuccess: () => {
      setMsg('Сохранено')
      void client.invalidateQueries({ queryKey: ['admin', 'plugins'] })
      setTimeout(() => setMsg(''), 2000)
    },
  })

  const test = useMutation({
    mutationFn: () => api.post('/admin/mail/test', {}),
    onSuccess: (res) => {
      const data = (res as { data?: { message?: string } })?.data
      setMsg(data?.message || 'Тестовое письмо отправлено')
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : 'Ошибка отправки'),
  })

  const testTelegram = useMutation({
    mutationFn: () => api.post('/admin/mail/test-telegram', {}),
    onSuccess: (res) => {
      const data = (res as { data?: { message?: string } })?.data
      setMsg(data?.message || 'Тестовое сообщение отправлено в Telegram')
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : 'Ошибка Telegram'),
  })

  if (isLoading || !plugin) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const set = (key: string, v: unknown) => setValues((p) => ({ ...p, [key]: v }))

  const field = (key: string, label: string, type = 'text') => (
    <label className="block space-y-1 text-sm">
      <span className="text-zinc-400">{label}</span>
      <input
        type={type === 'password' ? 'password' : type === 'number' ? 'number' : 'text'}
        className="w-full rounded-lg border border-white/10 bg-[#10141c] px-3 py-2"
        value={String(values[key] ?? '')}
        onChange={(e) => set(key, type === 'number' ? Number(e.target.value) : e.target.value)}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
      />
    </label>
  )

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-heading text-3xl">Почта</h1>
        <p className="mt-1 text-sm text-zinc-500">
          SMTP → Mail.ru / Яндекс 360 / Mailgun / Brevo. Функция mail() не используется.
          Цепочка: капча → rate limit → Mailer → SMTP.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(values)
        }}
      >
        <GlassPanel className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-200">Быстрый пресет SMTP</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PRESETS).map(([id, p]) => (
                <button
                  key={id}
                  type="button"
                  className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/5"
                  onClick={() => setValues((prev) => ({
                    ...prev,
                    smtp_host: p.host,
                    smtp_port: p.port,
                    smtp_encryption: p.encryption,
                  }))}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('from_name', 'Имя отправителя')}
            {field('from_email', 'Email отправителя')}
            {field('to_email', 'Email получателя')}
            {field('smtp_host', 'SMTP хост')}
            {field('smtp_port', 'SMTP порт', 'number')}
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Шифрование</span>
              <select
                className="w-full rounded-lg border border-white/10 bg-[#10141c] px-3 py-2"
                value={String(values.smtp_encryption ?? 'tls')}
                onChange={(e) => set('smtp_encryption', e.target.value)}
              >
                <option value="tls">STARTTLS (587)</option>
                <option value="ssl">SSL (465)</option>
                <option value="none">Без шифрования</option>
              </select>
            </label>
            {field('smtp_username', 'SMTP логин')}
            {field('smtp_password', 'SMTP пароль', 'password')}
            {field('success_message', 'Сообщение после отправки')}
          </div>
        </GlassPanel>

        <GlassPanel className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-zinc-200">Telegram</h2>
          <p className="text-xs text-zinc-500">
            Мгновенные уведомления о заявках. Бот у @BotFather, chat_id — через @userinfobot или API getUpdates.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={String(values.telegram_enabled ?? '0') === '1'}
              onChange={(e) => set('telegram_enabled', e.target.checked ? '1' : '0')}
            />
            <span className="text-zinc-300">Уведомлять в Telegram</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('telegram_bot_token', 'Bot token', 'password')}
            {field('telegram_chat_id', 'Chat ID')}
          </div>
        </GlassPanel>

        <GlassPanel className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-zinc-200">Защита формы</h2>
          <p className="text-xs text-zinc-500">
            Всегда: CSRF + honeypot + не более 1 сообщения с IP в минуту. Капча — опционально.
          </p>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Капча</span>
            <select
              className="w-full rounded-lg border border-white/10 bg-[#10141c] px-3 py-2"
              value={String(values.captcha_provider ?? 'none')}
              onChange={(e) => set('captcha_provider', e.target.value)}
            >
              <option value="none">Выключена</option>
              <option value="turnstile">Cloudflare Turnstile</option>
              <option value="smartcaptcha">Яндекс SmartCaptcha</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('turnstile_site_key', 'Turnstile site key')}
            {field('turnstile_secret', 'Turnstile secret', 'password')}
            {field('smartcaptcha_site_key', 'SmartCaptcha client key')}
            {field('smartcaptcha_secret', 'SmartCaptcha server key', 'password')}
          </div>
        </GlassPanel>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="admin-primary" disabled={save.isPending}>
            {save.isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
          <Button type="button" disabled={test.isPending} onClick={() => test.mutate()}>
            {test.isPending ? 'Отправка…' : 'Тестовое письмо'}
          </Button>
          <Button type="button" disabled={testTelegram.isPending} onClick={() => testTelegram.mutate()}>
            {testTelegram.isPending ? 'Отправка…' : 'Тест Telegram'}
          </Button>
          {msg && <span className="text-sm text-zinc-400">{msg}</span>}
        </div>
      </form>
    </div>
  )
}

/** Публичная форма: имя, email, сообщение + CSRF/honeypot/captcha. */
export function ContactFormWidget({
  settings = {},
}: {
  settings?: Record<string, unknown>
  editMode?: boolean
}) {
  const title = String(settings.title || 'Написать нам')
  const [status, setStatus] = useState('')
  const [csrf, setCsrf] = useState('')
  const [config, setConfig] = useState<MailConfig | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    void api.get<{ data: { csrf: string } }>('/mail/csrf').then((r) => {
      setCsrf((r as { data?: { csrf?: string } })?.data?.csrf ?? '')
    }).catch(() => setCsrf(''))
    void api.get<{ data: MailConfig }>('/mail/config').then((r) => {
      setConfig((r as { data?: MailConfig })?.data ?? null)
    }).catch(() => setConfig(null))
  }, [])

  useEffect(() => {
    if (!config) return
    if (config.captcha_provider === 'turnstile' && config.turnstile_site_key) {
      if (!document.getElementById('cf-turnstile-script')) {
        const s = document.createElement('script')
        s.id = 'cf-turnstile-script'
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
        s.async = true
        document.body.appendChild(s)
      }
    }
    if (config.captcha_provider === 'smartcaptcha' && config.smartcaptcha_site_key) {
      if (!document.getElementById('ya-smartcaptcha-script')) {
        const s = document.createElement('script')
        s.id = 'ya-smartcaptcha-script'
        s.src = 'https://smartcaptcha.yandexcloud.net/captcha.js'
        s.async = true
        document.body.appendChild(s)
      }
    }
  }, [config])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    if (fd.get('website') || fd.get('hp_field')) return
    setPending(true)
    setStatus('')
    try {
      const body: Record<string, unknown> = {
        name: String(fd.get('name') || ''),
        email: String(fd.get('email') || ''),
        message: String(fd.get('message') || ''),
        subject: String(fd.get('subject') || ''),
        csrf,
        captcha_token: String(fd.get('cf-turnstile-response') || fd.get('smart-token') || ''),
      }
      const res = await api.post<{ message?: string; data?: { message?: string } }>('/mail/contact', body)
      const message = (res as { message?: string })?.message
        || (res as { data?: { message?: string } })?.data?.message
        || config?.success_message
        || 'Спасибо! Сообщение отправлено.'
      setStatus(message)
      form.reset()
      // Обновить CSRF после успешной отправки
      const c = await api.get<{ data: { csrf: string } }>('/mail/csrf')
      setCsrf((c as { data?: { csrf?: string } })?.data?.csrf ?? '')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Не удалось отправить')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      {title && <h2 className="font-heading mb-4 text-2xl">{title}</h2>}
      <form className="space-y-3" onSubmit={onSubmit} autoComplete="on">
        {/* Honeypot — скрыто от людей, ловит ботов */}
        <input name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
        <input name="hp_field" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
        <input type="hidden" name="csrf" value={csrf} />
        <input required name="name" placeholder="Имя" autoComplete="name" maxLength={120} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" />
        <input required type="email" name="email" placeholder="Email" autoComplete="email" maxLength={255} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" />
        <textarea required name="message" placeholder="Сообщение" rows={5} maxLength={5000} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" />
        {config?.captcha_provider === 'turnstile' && config.turnstile_site_key && (
          <div className="cf-turnstile" data-sitekey={config.turnstile_site_key} />
        )}
        {config?.captcha_provider === 'smartcaptcha' && config.smartcaptcha_site_key && (
          <div
            id="captcha-container"
            className="smart-captcha"
            data-sitekey={config.smartcaptcha_site_key}
          />
        )}
        <button type="submit" disabled={pending || !csrf} className="button w-full sm:w-auto">
          {pending ? 'Отправка…' : 'Отправить'}
        </button>
        {status && <p className="text-sm text-[var(--muted)]">{status}</p>}
      </form>
    </div>
  )
}

registerModule({
  name: 'mail',
  label: 'Почта',
  adminNav: [
    { group: 'Почта', path: '/admin/mail', label: 'Почта', permission: 'settings.manage', icon: 'mail' },
  ],
  adminScreens: [
    { path: 'mail', label: 'Почта', group: 'Система', element: createElement(MailSettingsPage) },
  ],
  blocks: [
    {
      type: 'contact-form',
      label: 'Форма обратной связи',
      category: 'mail',
      defaultSettings: { title: 'Написать нам' },
      settingsFields: [
        { key: 'title', label: 'Заголовок', type: 'text' },
      ],
      Render: ContactFormWidget,
    },
  ],
})
