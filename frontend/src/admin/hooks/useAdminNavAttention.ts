import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiRequestError, endpoints } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { usePluginEnabled, usePluginsHydrated } from '@/hooks/useApi'
import { toCanonicalAdminPath } from '@/admin/adminBasePath'

export type NavAttentionMap = Record<string, number>

/**
 * "Loot / attention" badges for admin nav — counts of things worth claiming/handling.
 * Soft-fails per source so missing plugins don't break the shell.
 */
export function useAdminNavAttention(): NavAttentionMap {
  const { token, can } = useAuth()
  const hydrated = usePluginsHydrated()
  const formsOn = usePluginEnabled('forms')
  const commentsOn = usePluginEnabled('comments')
  const supportOn = usePluginEnabled('support')
  const notificationsOn = usePluginEnabled('notifications')

  const dash = useQuery({
    queryKey: ['dashboard', 'nav-attention'],
    enabled: hydrated && !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: endpoints.dashboard,
  })

  const formsNew = useQuery({
    queryKey: ['nav-attention', 'forms-new'],
    enabled: hydrated && !!token && formsOn && can('forms.submissions.view'),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const res = await api.get<{ data: Array<{ status?: string }> }>(
          '/admin/form-submissions?status=new',
          { silent: true },
        )
        const rows = (res as { data?: Array<{ status?: string }> }).data ?? []
        return rows.filter((r) => (r.status || 'new') === 'new').length
      } catch (err) {
        if (err instanceof ApiRequestError && (err.details.status === 404 || err.details.status === 403)) return 0
        return 0
      }
    },
  })

  const commentsPending = useQuery({
    queryKey: ['nav-attention', 'comments-pending'],
    enabled: hydrated && !!token && commentsOn && can('comments.view'),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const res = await api.get<{ data: unknown[] }>('/admin/comments?status=pending', { silent: true })
        return ((res as { data?: unknown[] }).data ?? []).length
      } catch {
        return 0
      }
    },
  })

  const supportOpen = useQuery({
    queryKey: ['nav-attention', 'support-open'],
    enabled: hydrated && !!token && supportOn && can('support.view'),
    staleTime: 30_000,
    refetchInterval: 45_000,
    retry: false,
    queryFn: async () => {
      try {
        const res = await api.get<{ data: Array<{ status?: string }> }>('/admin/support?status=waiting_agent', { silent: true })
        const rows = (res as { data?: Array<{ status?: string }> }).data ?? []
        return rows.length
      } catch {
        return 0
      }
    },
  })

  const notifUnread = useQuery({
    queryKey: ['nav-attention', 'notifications'],
    enabled: hydrated && !!token && notificationsOn && can('notifications.view'),
    staleTime: 30_000,
    refetchInterval: 45_000,
    retry: false,
    queryFn: async () => {
      try {
        const res = await api.get<{ data: { count: number } }>('/admin/notifications/unread-count', { silent: true })
        return (res as { data: { count: number } }).data?.count ?? 0
      } catch {
        return 0
      }
    },
  })

  return useMemo(() => {
    const map: NavAttentionMap = {}
    const put = (path: string, n: number) => {
      if (n > 0) map[toCanonicalAdminPath(path)] = n
    }

    put('/admin/messages', Number(dash.data?.unread_messages ?? 0))
    put('/admin/trash', Number(dash.data?.trash_total ?? 0))
    put('/admin/form-submissions', Number(formsNew.data ?? 0))
    put('/admin/comments', Number(commentsPending.data ?? 0))
    put('/admin/support', Number(supportOpen.data ?? 0))
    put('/admin/notifications', Number(notifUnread.data ?? 0))

    return map
  }, [dash.data, formsNew.data, commentsPending.data, supportOpen.data, notifUnread.data])
}

export function formatAttentionBadge(n: number): string {
  if (n <= 0) return ''
  if (n > 99) return '99+'
  return String(n)
}
