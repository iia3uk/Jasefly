import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui'
import { usePluginEnabled } from '@/hooks/useApi'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'
import { unpack, WidgetChrome } from './shared'

type FormRow = {
  id: number
  name?: string
  title?: string
  submissions_count?: number
}

type Submission = {
  id: number
  form_id?: number
  status?: string
  created_at?: string
  payload?: Record<string, unknown>
}

export function FormsWidget() {
  const on = usePluginEnabled('forms')
  const forms = useQuery({
    queryKey: ['dashboard-widget', 'forms'],
    enabled: on,
    staleTime: 60_000,
    queryFn: async () => unpack<FormRow[]>(await api.get('/admin/forms')),
  })
  const subs = useQuery({
    queryKey: ['dashboard-widget', 'form-submissions'],
    enabled: on,
    staleTime: 30_000,
    queryFn: async () => unpack<Submission[]>(await api.get('/admin/form-submissions')),
  })

  const totalSubs = (forms.data ?? []).reduce((s, f) => s + Number(f.submissions_count || 0), 0)
  const newCount = (subs.data ?? []).filter((s) => (s.status || 'new') === 'new').length
  const recent = (subs.data ?? []).slice(0, 5)

  return (
    <WidgetChrome
      title="Формы"
      hint="Заявки и формы сайта"
      href={adminUrl('/form-submissions')}
      icon={ClipboardList}
      accent="emerald"
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          { label: 'Формы', value: forms.data?.length ?? 0 },
          { label: 'Заявки', value: totalSubs },
          { label: 'Новые', value: newCount },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-white/[0.06] bg-black/25 px-2.5 py-2">
            <p className="text-[10px] text-zinc-500">{m.label}</p>
            <p className="font-heading text-xl tabular-nums text-zinc-50">
              {forms.isLoading || subs.isLoading ? '—' : m.value}
            </p>
          </div>
        ))}
      </div>
      {subs.isLoading ? (
        <Skeleton className="h-24" />
      ) : recent.length ? (
        <ul className="space-y-2">
          {recent.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm">
              <span className="truncate text-zinc-300">#{s.id} · {s.status || 'new'}</span>
              <span className="shrink-0 text-[11px] text-zinc-600">
                {formatMoscowDateTime(s.created_at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Заявок пока нет</p>
      )}
    </WidgetChrome>
  )
}
