import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BookOpen, ChevronDown, Loader2, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { Button, GhostButton, GlassPanel } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { useAuth } from '@/context/AuthContext'
import { usePluginEnabled } from '@/hooks/useApi'
import { adminUrl } from '@/admin/adminBasePath'

export type NotificationRow = {
  id: number
  type: string
  title: string
  body?: string
  action_url?: string
  priority: string
  is_read: number | boolean
  created_at: string
}

const unpack = <T,>(v: { data?: T } | T): T =>
  ('data' in (v as object) ? (v as { data: T }).data : v as T)

export function NotificationsPage() {
  return (
    <RequirePermission permission="notifications.view">
      <NotificationsInner />
    </RequirePermission>
  )
}

function NotificationsHelp() {
  const [open, setOpen] = useState(false)
  return (
    <GlassPanel className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-100">
          <BookOpen className="h-4 w-4 text-emerald-400" />
          Почему пусто и как появляются уведомления
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-5 border-t border-zinc-800 px-4 py-4 text-sm leading-relaxed text-zinc-300">
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Зачем эта страница</h2>
            <p>
              Это <strong className="text-zinc-100">внутренний ящик админов</strong>: колокольчик в шапке + список здесь.
              Сюда <em>не</em> падают письма посетителей и не тикеты чата — только то, что система/модули
              явно создали через сервис уведомлений.
            </p>
            <p className="text-zinc-400">
              Пустой список — нормально, пока никто не вызвал «создать уведомление». Сами по себе события сайта
              сюда не пишутся.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Откуда приходят</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <Link to={adminUrl('/automations')} className="text-emerald-400 hover:underline">Автоматизация</Link>
                {' '}— шаг <code className="text-zinc-200">create_notification</code> (пресет «уведомление»).
                Статус правила должен быть <strong className="text-zinc-100">Активна</strong>.
              </li>
              <li>
                <Link to={adminUrl('/forms')} className="text-emerald-400 hover:underline">Формы</Link>
                {' '}— в действиях формы после отправки включено <code className="text-zinc-200">create_notification</code>.
              </li>
              <li>
                Пакетные модули / SDK — вызов <code className="text-zinc-200">notifyAdmins(...)</code>.
              </li>
              <li>
                Кнопка <strong className="text-zinc-100">«Тест»</strong> на этой странице — проверка, что канал жив.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Куда ещё уходит</h2>
            <p>
              Запись в этом списке = канал <strong className="text-zinc-100">browser</strong> (колокольчик).
              Дополнительно система может слать:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-zinc-400">
              <li>
                <strong className="text-zinc-300">Email</strong> — админам/super_admin, если модуль Mail настроен
                (SMTP) и канал не отключён в предпочтениях.
              </li>
              <li>
                <strong className="text-zinc-300">Telegram</strong> — если в настройках Mail указаны bot token и chat id.
              </li>
            </ul>
            <p className="text-xs text-zinc-500">
              Почта/Telegram — бонус к строке в ящике; без них уведомление всё равно должно появиться здесь после «Тест» или автоматизации.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Быстрый старт</h2>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Плагин «Уведомления» включён (иначе страница пустая / недоступна).</li>
              <li>Нажмите «Отправить тест» — должна появиться строка ниже и бейдж на колокольчике.</li>
              <li>
                Для реальных заявок: Автоматизация на <code className="text-zinc-200">form.submitted</code> +
                пресет уведомления, статус Активна — или действие формы create_notification.
              </li>
            </ol>
          </section>
        </div>
      ) : null}
    </GlassPanel>
  )
}

function NotificationsInner() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const canManage = can('notifications.manage')
  const pluginOn = usePluginEnabled('notifications')
  const [testMsg, setTestMsg] = useState('')

  const query = useQuery({
    queryKey: ['notifications'],
    enabled: pluginOn,
    queryFn: async () => unpack<NotificationRow[]>(await api.get('/admin/notifications')),
    refetchInterval: pluginOn ? 15_000 : false,
  })

  const read = useMutation({
    mutationFn: (id: number) => api.post(`/admin/notifications/${id}/read`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications'] })
      await qc.invalidateQueries({ queryKey: ['notifications-unread'] })
      await qc.invalidateQueries({ queryKey: ['notifications-bell'] })
    },
  })

  const all = useMutation({
    mutationFn: () => api.post('/admin/notifications/read-all', {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications'] })
      await qc.invalidateQueries({ queryKey: ['notifications-unread'] })
      await qc.invalidateQueries({ queryKey: ['notifications-bell'] })
    },
  })

  const test = useMutation({
    mutationFn: () =>
      api.post('/admin/notifications/test', {
        title: 'Тестовое уведомление',
        body: 'Канал «Уведомления» работает. Дальше настройте Автоматизацию или действие формы.',
      }),
    onSuccess: async () => {
      setTestMsg('Тест отправлен — смотрите список и колокольчик в шапке.')
      await qc.invalidateQueries({ queryKey: ['notifications'] })
      await qc.invalidateQueries({ queryKey: ['notifications-unread'] })
      await qc.invalidateQueries({ queryKey: ['notifications-bell'] })
    },
    onError: (e) => setTestMsg(e instanceof Error ? e.message : 'Не удалось отправить тест'),
  })

  if (!pluginOn) {
    return (
      <GlassPanel className="space-y-3 p-6 text-sm text-zinc-400">
        <p>
          Модуль <strong className="text-zinc-200">Уведомления</strong> выключен — поэтому «ничего не приходит».
        </p>
        <p>
          Включите его в{' '}
          <Link to={adminUrl('/plugins')} className="text-emerald-400 hover:underline">Плагинах</Link>,
          обновите страницу, затем нажмите «Отправить тест».
        </p>
      </GlassPanel>
    )
  }

  const rows = query.data ?? []

  return (
    <div className="space-y-4">
      <AdminPageHero
        title="Уведомления"
        hint="Ящик админов (колокольчик). Не тикеты и не почта посетителей — только то, что создали модули/автоматизации."
        eyebrow="Коммуникации"
        accent="amber"
        actions={
          <>
            {canManage ? (
              <Button
                type="button"
                className="admin-primary"
                disabled={test.isPending}
                onClick={() => {
                  setTestMsg('')
                  test.mutate()
                }}
              >
                {test.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                Отправить тест
              </Button>
            ) : null}
            <GhostButton type="button" onClick={() => all.mutate()} disabled={all.isPending || !rows.length}>
              Прочитать все
            </GhostButton>
          </>
        }
      />

      <NotificationsHelp />

      {testMsg ? (
        <p className={`text-sm ${test.isError ? 'text-red-400' : 'text-emerald-400/90'}`}>{testMsg}</p>
      ) : null}

      <GlassPanel className="divide-y divide-white/10 p-0">
        {query.isLoading ? (
          <p className="p-6 text-sm text-zinc-500">Загрузка…</p>
        ) : null}
        {!query.isLoading && !rows.length ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Bell className="h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-400">Уведомлений нет</p>
            <p className="max-w-md text-xs text-zinc-500">
              Это не ошибка. Нажмите «Отправить тест» или настройте Автоматизацию с действием create_notification
              / действие формы после отправки.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Link to={adminUrl('/automations')} className="text-sm text-emerald-400 hover:underline">
                Автоматизации
              </Link>
              <span className="text-zinc-600">·</span>
              <Link to={adminUrl('/forms')} className="text-sm text-emerald-400 hover:underline">
                Формы
              </Link>
              <span className="text-zinc-600">·</span>
              <Link to={adminUrl('/plugins')} className="text-sm text-emerald-400 hover:underline">
                Плагины
              </Link>
            </div>
          </div>
        ) : null}
        {rows.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              if (!n.is_read) read.mutate(n.id)
              if (!n.action_url) return
              if (/^https?:\/\//i.test(n.action_url)) {
                window.location.href = n.action_url
                return
              }
              const path = n.action_url.replace(/^\/admin/, '') || '/notifications'
              window.location.href = adminUrl(path.startsWith('/') ? path : `/${path}`)
            }}
            className={`block w-full p-4 text-left transition hover:bg-white/5 ${n.is_read ? 'opacity-60' : ''}`}
          >
            <div className="flex justify-between gap-3">
              <strong className="text-zinc-100">{n.title}</strong>
              <span className="shrink-0 text-xs text-zinc-500">{n.created_at}</span>
            </div>
            {n.body ? <p className="mt-1 text-sm text-zinc-400">{n.body}</p> : null}
            <span className="mt-1 block text-xs text-zinc-600">{n.type}</span>
          </button>
        ))}
      </GlassPanel>
    </div>
  )
}
