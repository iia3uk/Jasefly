import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { adminUrl } from '@/admin/adminBasePath'
import { usePluginEnabled } from '@/hooks/useApi'

export type LabExperimentRow = {
  id: number
  name: string
  slug: string
  entry_key: string
  status: string
  is_public: boolean
  noindex: boolean
  render_mode: string
  deleted_at?: string | null
  updated_at?: string
  created_at?: string
}

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  active: 'Активен',
  disabled: 'Отключён',
  archived: 'Архив',
}

export function LabListPage() {
  return (
    <RequirePermission permission="lab.view">
      <LabListInner />
    </RequirePermission>
  )
}

function LabListInner() {
  const qc = useQueryClient()
  const pluginOn = usePluginEnabled('lab')
  const q = useQuery({
    queryKey: ['lab-experiments'],
    enabled: pluginOn,
    queryFn: async () => asData<LabExperimentRow[]>(await api.get('/admin/lab/experiments')),
  })

  const create = useMutation({
    mutationFn: async () => asData<LabExperimentRow>(await api.post('/admin/lab/experiments', {
      name: 'Новый эксперимент',
      slug: `experiment-${Date.now().toString(36)}`,
      entry_key: 'starter',
      status: 'draft',
      is_public: false,
      noindex: true,
      render_mode: 'embedded',
    })),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ['lab-experiments'] })
      window.location.assign(adminUrl(`/lab/${row.id}`))
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-white">
            <Sparkles className="h-6 w-6" /> Jasefly Lab
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Изолированные эксперименты на /lab/:slug — без влияния на тему и Page Builder.
          </p>
        </div>
        <RequirePermission permission="lab.create">
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="h-4 w-4" /> Создать
          </Button>
        </RequirePermission>
      </div>

      <GlassPanel className="overflow-hidden">
        {q.isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !q.data?.length ? (
          <div className="p-10 text-center text-sm text-muted">
            Пока нет экспериментов. Создайте starter или свой entry.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-muted">
                <th className="px-4 py-3 font-medium">Название</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Entry</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Публичный</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {q.data.map((row) => (
                <tr key={row.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">/lab/{row.slug}</td>
                  <td className="px-4 py-3">{row.entry_key}</td>
                  <td className="px-4 py-3">{STATUS_LABEL[row.status] || row.status}</td>
                  <td className="px-4 py-3">{row.is_public ? 'Да' : 'Нет'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={adminUrl(`/lab/${row.id}`)}>
                      <GhostButton type="button">Открыть</GhostButton>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassPanel>
    </div>
  )
}
