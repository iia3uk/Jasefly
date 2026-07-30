import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui'
import { usePluginEnabled } from '@/hooks/useApi'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'
import { unpack, WidgetChrome } from './shared'

type Order = {
  id: number
  number: string
  status: string
  grand_total?: number
  amount?: number
  currency?: string
  customer_name?: string
  email?: string
  created_at?: string
}

const STATUS_RU: Record<string, string> = {
  new: 'Новый',
  pending: 'Ожидает',
  paid: 'Оплачен',
  processing: 'В работе',
  shipped: 'Отправлен',
  completed: 'Готов',
  cancelled: 'Отменён',
  refunded: 'Возврат',
}

export function OrdersWidget() {
  const on = usePluginEnabled('orders')
  const q = useQuery({
    queryKey: ['dashboard-widget', 'orders'],
    enabled: on,
    staleTime: 45_000,
    queryFn: async () => unpack<Order[]>(await api.get('/admin/orders')),
  })

  const byStatus = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of q.data ?? []) {
      map.set(o.status, (map.get(o.status) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [q.data])

  const recent = (q.data ?? []).slice(0, 5)
  const maxBar = Math.max(1, ...byStatus.map(([, n]) => n))

  return (
    <WidgetChrome
      title="Заказы"
      hint="Сводка по выборке заказов"
      href={adminUrl('/orders')}
      icon={ShoppingCart}
      accent="violet"
    >
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
          <p className="text-[10px] text-zinc-500">В выборке</p>
          <p className="font-heading text-2xl tabular-nums">
            {q.isLoading ? '—' : (q.data?.length ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5">
          <p className="text-[10px] text-violet-200/70">Активные</p>
          <p className="font-heading text-2xl tabular-nums text-violet-100">
            {q.isLoading
              ? '—'
              : (q.data ?? []).filter((o) => !['completed', 'cancelled', 'refunded'].includes(o.status)).length}
          </p>
        </div>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-28" />
      ) : (
        <>
          {byStatus.length ? (
            <div className="mb-3 space-y-2">
              {byStatus.map(([status, n]) => (
                <div key={status}>
                  <div className="mb-0.5 flex justify-between text-[11px] text-zinc-500">
                    <span>{STATUS_RU[status] ?? status}</span>
                    <span className="tabular-nums">{n}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-400/80 to-fuchsia-400/40"
                      style={{ width: `${Math.round((n / maxBar) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {recent.length ? (
            <ul className="space-y-1.5">
              {recent.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-zinc-300">
                    #{o.number} · {o.customer_name || o.email || '—'}
                  </span>
                  <span className="shrink-0 text-[11px] text-zinc-600">
                    {formatMoscowDateTime(o.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">Заказов пока нет</p>
          )}
        </>
      )}
    </WidgetChrome>
  )
}
