import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ApiRequestError } from '@/lib/api'
import { adminUrl } from '@/admin/adminBasePath'
import type { NotificationRow } from '@/admin/pages/NotificationsPage'
import { usePluginEnabled, usePluginsHydrated } from '@/hooks/useApi'
import { useAuth } from '@/context/AuthContext'

export function NotificationsBell() {
  const enabled = usePluginEnabled('notifications')
  const hydrated = usePluginsHydrated()
  const { can, token } = useAuth()
  const allowed = hydrated && !!token && enabled && can('notifications.view')
  const [open, setOpen] = useState(false)

  const count = useQuery({
    queryKey: ['notifications-unread'],
    enabled: allowed,
    refetchInterval: (q) => (q.state.error ? false : 30_000),
    retry: false,
    queryFn: async () => {
      try {
        const res = await api.get<{ data: { count: number } }>(
          '/admin/notifications/unread-count',
          { silent: true },
        )
        return (res as { data: { count: number } }).data.count
      } catch (err) {
        // Plugin off / no route → quiet; auth expiry handled by api client.
        if (err instanceof ApiRequestError && (err.details.status === 404 || err.details.status === 403)) {
          return 0
        }
        throw err
      }
    },
  })

  const recent = useQuery({
    queryKey: ['notifications-bell'],
    enabled: allowed && open,
    retry: false,
    queryFn: async () => (
      (await api.get<{ data: NotificationRow[] }>('/admin/notifications?unread=1', { silent: true })) as {
        data: NotificationRow[]
      }
    ).data,
  })

  if (!allowed) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white"
        aria-label="Уведомления"
      >
        <Bell size={16} />
        {(count.data ?? 0) > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] text-white">
            {Math.min(99, count.data ?? 0)}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[85vw] rounded-xl border border-white/10 bg-zinc-950 p-2 shadow-2xl">
          <div className="px-2 py-1 text-xs uppercase text-zinc-500">Непрочитанные</div>
          {recent.data?.slice(0, 6).map((n) => (
            <div key={n.id} className="rounded-lg px-2 py-2 text-sm hover:bg-white/5">
              <div>{n.title}</div>
              <div className="truncate text-xs text-zinc-500">{n.body}</div>
            </div>
          ))}
          {!recent.data?.length ? <div className="p-3 text-sm text-zinc-500">Новых нет</div> : null}
          <Link
            to={adminUrl('/notifications')}
            onClick={() => setOpen(false)}
            className="block border-t border-white/10 px-2 pt-2 text-sm text-emerald-400"
          >
            Все уведомления
          </Link>
        </div>
      ) : null}
    </div>
  )
}
