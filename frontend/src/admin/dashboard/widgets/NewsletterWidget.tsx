import { useQuery } from '@tanstack/react-query'
import { Newspaper } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui'
import { usePluginEnabled } from '@/hooks/useApi'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'
import { unpack, WidgetChrome } from './shared'

type Subscriber = { id: number; email: string; name?: string }
type Campaign = {
  id: number
  name?: string
  subject?: string
  status?: string
  updated_at?: string
  created_at?: string
}

export function NewsletterWidget() {
  const on = usePluginEnabled('newsletter')
  const subs = useQuery({
    queryKey: ['dashboard-widget', 'newsletter-subs'],
    enabled: on,
    staleTime: 60_000,
    queryFn: async () => unpack<Subscriber[]>(await api.get('/admin/newsletter/subscribers')),
  })
  const camps = useQuery({
    queryKey: ['dashboard-widget', 'newsletter-camps'],
    enabled: on,
    staleTime: 60_000,
    queryFn: async () => unpack<Campaign[]>(await api.get('/admin/newsletter/campaigns')),
  })

  const recent = (camps.data ?? []).slice(0, 4)

  return (
    <WidgetChrome
      title="Рассылка"
      hint="Подписчики и кампании"
      href={adminUrl('/newsletter/campaigns')}
      icon={Newspaper}
      accent="teal"
    >
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
          <p className="text-[10px] text-zinc-500">Подписчики</p>
          <p className="font-heading text-2xl tabular-nums">
            {subs.isLoading ? '—' : (subs.data?.length ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-teal-400/20 bg-teal-500/10 px-3 py-2.5">
          <p className="text-[10px] text-teal-200/70">Кампании</p>
          <p className="font-heading text-2xl tabular-nums text-teal-100">
            {camps.isLoading ? '—' : (camps.data?.length ?? 0)}
          </p>
        </div>
      </div>
      {camps.isLoading ? (
        <Skeleton className="h-24" />
      ) : recent.length ? (
        <ul className="space-y-2">
          {recent.map((c) => (
            <li key={c.id} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate text-zinc-200">{c.name || c.subject || `#${c.id}`}</span>
                <span className="shrink-0 text-[11px] text-zinc-500">{c.status || '—'}</span>
              </div>
              <p className="text-[11px] text-zinc-600">
                {formatMoscowDateTime(c.updated_at || c.created_at)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Кампаний пока нет</p>
      )}
    </WidgetChrome>
  )
}
