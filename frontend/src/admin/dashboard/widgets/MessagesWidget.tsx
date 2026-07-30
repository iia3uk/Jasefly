import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useDashboard } from '@/hooks/useApi'
import { GlassPanel, Skeleton } from '@/components/ui'
import { t } from '@/admin/i18n'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'
import { WidgetChrome } from './shared'

export function MessagesWidget() {
  const { data, isLoading } = useDashboard()
  const unread = data?.unread_messages ?? 0

  return (
    <WidgetChrome
      title={t.recentMessages}
      hint={unread > 0 ? `${t.unreadMessages}: ${unread}` : 'Последние письма с контакт-формы'}
      href={adminUrl('/messages')}
      icon={Mail}
      accent="amber"
    >
      <div className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : data?.messages?.length ? (
          data.messages.map((x) => {
            const isUnread = Number(x.is_read ?? 0) === 0
            return (
              <Link key={String(x.id)} to={adminUrl('/messages')} className="block">
                <GlassPanel className={`p-3.5 transition hover:bg-white/[0.03] ${isUnread ? 'border-amber-400/20' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <b className="truncate text-sm text-zinc-100">{x.name}</b>
                    {isUnread && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-300">{t.unreadShort}</span>
                    )}
                  </div>
                  <p className="truncate text-sm text-zinc-500">{x.subject || x.message}</p>
                  <p className="mt-1 text-[11px] text-zinc-600">{formatMoscowDateTime(x.created_at)}</p>
                </GlassPanel>
              </Link>
            )
          })
        ) : (
          <p className="py-6 text-center text-sm text-zinc-500">{t.noMessages}</p>
        )}
      </div>
    </WidgetChrome>
  )
}
