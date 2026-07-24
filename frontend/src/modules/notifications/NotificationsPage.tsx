import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button, GlassPanel } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'

export type NotificationRow = {
  id: number; type: string; title: string; body?: string; action_url?: string
  priority: string; is_read: number | boolean; created_at: string
}
const unpack = <T,>(v: { data?: T } | T): T => ('data' in (v as object) ? (v as { data: T }).data : v as T)

export function NotificationsPage() {
  return <RequirePermission permission="notifications.view"><NotificationsInner /></RequirePermission>
}
function NotificationsInner() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['notifications'], queryFn: async () => unpack<NotificationRow[]>(await api.get('/admin/notifications')) })
  const read = useMutation({ mutationFn: (id: number) => api.post(`/admin/notifications/${id}/read`, {}),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['notifications'] }); await qc.invalidateQueries({ queryKey: ['notifications-unread'] }) } })
  const all = useMutation({ mutationFn: () => api.post('/admin/notifications/read-all', {}),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['notifications'] }); await qc.invalidateQueries({ queryKey: ['notifications-unread'] }) } })
  return <div className="space-y-4"><div className="flex items-end justify-between"><div>
    <h1 className="font-heading text-2xl">Уведомления</h1><p className="text-sm text-zinc-400">События CMS и системные сообщения.</p>
  </div><Button onClick={() => all.mutate()} disabled={all.isPending}>Прочитать все</Button></div>
    <GlassPanel className="divide-y divide-white/10 p-0">{query.data?.map((n) => <button key={n.id} type="button"
      onClick={() => { if (!n.is_read) read.mutate(n.id); if (n.action_url) window.location.href = n.action_url }}
      className={`block w-full p-4 text-left hover:bg-white/5 ${n.is_read ? 'opacity-60' : ''}`}>
      <div className="flex justify-between gap-3"><strong>{n.title}</strong><span className="text-xs text-zinc-500">{n.created_at}</span></div>
      {n.body ? <p className="mt-1 text-sm text-zinc-400">{n.body}</p> : null}
      <span className="mt-1 block text-xs text-zinc-600">{n.type}</span>
    </button>)}{!query.data?.length ? <p className="p-6 text-sm text-zinc-500">Уведомлений нет</p> : null}</GlassPanel>
  </div>
}
