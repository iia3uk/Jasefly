import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Inbox, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { useAuth } from '@/context/AuthContext'
import { adminUrl } from '@/admin/adminBasePath'
import { usePluginEnabled } from '@/hooks/useApi'

type SubmissionRow = {
  id: number
  public_id: string
  form_id: number
  status: string
  page_url?: string | null
  created_at?: string | null
  form_name?: string | null
  form_slug?: string | null
}

type SubmissionDetail = SubmissionRow & {
  internal_note?: string | null
  values?: Array<{
    field_name: string
    field_label?: string | null
    value_text?: string | null
  }>
}

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

const STATUS_LABEL: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  resolved: 'Решена',
  spam: 'Спам',
  archived: 'Архив',
}

const STATUS_OPTIONS = ['new', 'in_progress', 'resolved', 'spam', 'archived']

export function FormSubmissionsPage() {
  return (
    <RequirePermission permission="forms.submissions.view">
      <FormSubmissionsInner />
    </RequirePermission>
  )
}

function FormSubmissionsInner() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const canManage = can('forms.submissions.manage')
  const pluginOn = usePluginEnabled('forms')
  const [params, setParams] = useSearchParams()
  const formId = Number(params.get('form_id') || 0) || 0
  const [status, setStatus] = useState(params.get('status') || 'all')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const setStatusFilter = (next: string) => {
    setStatus(next)
    const sp = new URLSearchParams(params)
    if (next === 'all') sp.delete('status')
    else sp.set('status', next)
    setParams(sp, { replace: true })
  }

  const submissions = useQuery({
    queryKey: ['admin', 'form-submissions', formId, status],
    enabled: pluginOn,
    queryFn: async () => {
      const q = new URLSearchParams()
      if (formId > 0) q.set('form_id', String(formId))
      if (status !== 'all') q.set('status', status)
      const qs = q.toString()
      return asData<SubmissionRow[]>(await api.get(`/admin/form-submissions${qs ? `?${qs}` : ''}`))
    },
    refetchInterval: pluginOn ? 8000 : false,
  })

  const detail = useQuery({
    queryKey: ['admin', 'form-submissions', selectedId],
    enabled: pluginOn && selectedId != null,
    queryFn: async () => asData<SubmissionDetail>(await api.get(`/admin/form-submissions/${selectedId}`)),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, nextStatus }: { id: number; nextStatus: string }) =>
      api.put(`/admin/form-submissions/${id}`, { status: nextStatus }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'form-submissions'] })
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/form-submissions/${id}`),
    onSuccess: async () => {
      setSelectedId(null)
      await qc.invalidateQueries({ queryKey: ['admin', 'form-submissions'] })
    },
  })

  const rows = submissions.data ?? []
  const sub = detail.data
  const statusFilters = useMemo(() => ['all', ...STATUS_OPTIONS], [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl text-white">Заявки форм</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Отправки виджета «Форма» и других форм плагина Forms.
            {formId > 0 ? ` · фильтр form_id=${formId}` : ''}
          </p>
        </div>
        <Link to={adminUrl('forms')} className="text-sm text-zinc-300 underline hover:text-white">
          К формам
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusFilters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs ${
              status === s ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {s === 'all' ? 'Все' : STATUS_LABEL[s] || s}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <GlassPanel className="max-h-[70vh] overflow-y-auto p-2">
          {submissions.isLoading ? <Skeleton className="m-2 h-40" /> : null}
          {!submissions.isLoading && !rows.length ? (
            <p className="p-4 text-sm text-zinc-500">Заявок нет</p>
          ) : null}
          {rows.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`mb-1 w-full rounded-xl px-3 py-2 text-left transition ${
                selectedId === s.id ? 'bg-zinc-800' : 'hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-zinc-400">{s.public_id.slice(0, 10)}</span>
                <span className="shrink-0 text-[10px] uppercase text-zinc-500">
                  {STATUS_LABEL[s.status] || s.status}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-zinc-200">{s.form_name || s.form_slug || `form #${s.form_id}`}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{s.created_at || '—'}</p>
            </button>
          ))}
        </GlassPanel>

        <GlassPanel className="flex max-h-[70vh] flex-col p-0">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-zinc-500">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">Выберите заявку</p>
            </div>
          ) : detail.isLoading ? (
            <div className="p-6"><Skeleton className="h-48" /></div>
          ) : sub ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-zinc-400">{sub.public_id}</div>
                  <div className="mt-1 text-sm text-zinc-200">
                    {sub.form_name || sub.form_slug || `form #${sub.form_id}`}
                  </div>
                  {sub.page_url ? (
                    <a href={sub.page_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-emerald-400/80">
                      {sub.page_url}
                    </a>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-500">{sub.created_at || '—'}</p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                      value={sub.status}
                      disabled={updateStatus.isPending}
                      onChange={(e) => updateStatus.mutate({ id: sub.id, nextStatus: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>{STATUS_LABEL[st] || st}</option>
                      ))}
                    </select>
                    <GhostButton
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm('Удалить заявку?')) remove.mutate(sub.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </GhostButton>
                  </div>
                ) : null}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {(sub.values ?? []).map((v) => (
                  <div key={v.field_name} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <p className="text-xs uppercase text-zinc-500">{v.field_label || v.field_name}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-100">{v.value_text || '—'}</p>
                  </div>
                ))}
                {!sub.values?.length ? (
                  <p className="text-sm text-zinc-500">Нет значений полей</p>
                ) : null}
              </div>
            </>
          ) : null}
        </GlassPanel>
      </div>
    </div>
  )
}
