import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui'
import { usePluginEnabled } from '@/hooks/useApi'
import { useAuth } from '@/context/AuthContext'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'
import { unpack, WidgetChrome } from './shared'

type NotificationRow = {
  id: number
  title: string
  body?: string
  created_at?: string
  is_read?: number | boolean
}

export function NotificationsWidget() {
  const enabled = usePluginEnabled('notifications')
  const { can } = useAuth()
  const allowed = enabled && can('notifications.view')

  const count = useQuery({
    queryKey: ['notifications-unread'],
    enabled: allowed,
    staleTime: 20_000,
    queryFn: async () => {
      const res = await api.get<{ data: { count: number } } | { count: number }>('/admin/notifications/unread-count')
      const data = unpack<{ count: number }>(res)
      return data.count
    },
    retry: false,
  })

  const recent = useQuery({
    queryKey: ['dashboard-widget', 'notifications'],
    enabled: allowed,
    staleTime: 20_000,
    queryFn: async () => unpack<NotificationRow[]>(await api.get('/admin/notifications?unread=1')),
    retry: false,
  })

  if (!allowed) return null

  return (
    <WidgetChrome
      title="Уведомления"
      hint="Непрочитанные события системы"
      href={adminUrl('/notifications')}
      icon={Bell}
      accent="amber"
    >
      <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-3">
        <p className="text-[10px] text-amber-200/70">Непрочитано</p>
        <p className="font-heading text-3xl tabular-nums text-amber-50">
          {count.isLoading ? '—' : (count.data ?? 0)}
        </p>
      </div>
      {recent.isLoading ? (
        <Skeleton className="h-24" />
      ) : (recent.data ?? []).length ? (
        <ul className="space-y-2">
          {(recent.data ?? []).slice(0, 5).map((n) => (
            <li key={n.id} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
              <p className="truncate text-sm text-zinc-200">{n.title}</p>
              {n.body ? <p className="truncate text-xs text-zinc-500">{n.body}</p> : null}
              <p className="mt-0.5 text-[11px] text-zinc-600">{formatMoscowDateTime(n.created_at)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Новых уведомлений нет</p>
      )}
    </WidgetChrome>
  )
}
