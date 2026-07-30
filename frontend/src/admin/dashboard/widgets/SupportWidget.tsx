import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui'
import { usePluginEnabled } from '@/hooks/useApi'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'
import { unpack, WidgetChrome } from './shared'

type Ticket = {
  id: number
  status: string
  contact_email?: string | null
  last_body?: string | null
  updated_at?: string | null
  last_message_at?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Открыт',
  awaiting_contact: 'Ждёт контакт',
  waiting_agent: 'Ждёт агента',
  bot: 'Бот',
  closed: 'Закрыт',
}

export function SupportWidget() {
  const on = usePluginEnabled('support')
  const q = useQuery({
    queryKey: ['dashboard-widget', 'support-tickets'],
    enabled: on,
    staleTime: 30_000,
    queryFn: async () => unpack<Ticket[]>(await api.get('/admin/support/tickets')),
  })

  const tickets = (q.data ?? []).slice(0, 6)
  const openCount = (q.data ?? []).filter((t) => t.status !== 'closed').length

  return (
    <WidgetChrome
      title="Поддержка"
      hint="Тикеты чата и FAQ-бота"
      href={adminUrl('/support')}
      icon={MessageCircle}
      accent="sky"
    >
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
          <p className="text-[10px] text-zinc-500">В выборке</p>
          <p className="font-heading text-2xl tabular-nums text-zinc-50">
            {q.isLoading ? '—' : (q.data?.length ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2.5">
          <p className="text-[10px] text-sky-200/70">Не закрыты</p>
          <p className="font-heading text-2xl tabular-nums text-sky-100">
            {q.isLoading ? '—' : openCount}
          </p>
        </div>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-28" />
      ) : tickets.length ? (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="rounded border border-white/10 px-1.5 py-0.5 text-zinc-400">
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
                <span className="text-zinc-600">
                  {formatMoscowDateTime(String(t.last_message_at || t.updated_at || ''))}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-zinc-300">
                {t.contact_email || 'Гость'} · {t.last_body || '—'}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Тикетов пока нет</p>
      )}
    </WidgetChrome>
  )
}
