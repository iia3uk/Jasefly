import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { adminUrl } from '@/admin/adminBasePath'
import { useAdminRouteParams } from '@/admin/AdminRouteParams'
import { usePluginEnabled } from '@/hooks/useApi'
import { LabBareLayout } from '../LabBareLayout'
import { LabExperimentHost, type LabExperimentPayload } from '../LabExperimentHost'

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

export function LabPreviewPage() {
  return (
    <RequirePermission permission="lab.preview">
      <LabPreviewInner />
    </RequirePermission>
  )
}

function LabPreviewInner() {
  const { id = '' } = useAdminRouteParams()
  const pluginOn = usePluginEnabled('lab')
  const q = useQuery({
    queryKey: ['lab-preview', id],
    enabled: pluginOn && Boolean(id),
    queryFn: async () => asData<LabExperimentPayload>(await api.get(`/admin/lab/experiments/${id}/preview`)),
  })

  if (q.isLoading) {
    return <div className="p-10 text-sm text-muted">Загрузка preview…</div>
  }

  if (q.isError || !q.data) {
    return (
      <div className="p-10 space-y-3">
        <p className="text-red-400">Не удалось загрузить preview.</p>
        <Link to={adminUrl(`/lab/${id}`)} className="text-sm underline">Назад к редактированию</Link>
      </div>
    )
  }

  const exp = q.data
  return (
    <div className="-m-6">
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/20 text-amber-100 text-sm">
        <span>Preview: {exp.name} · entry <code>{exp.entry_key}</code></span>
        <div className="flex gap-3">
          <Link to={adminUrl(`/lab/${id}`)} className="underline">Редактировать</Link>
          <a href={`/lab/${exp.slug}`} target="_blank" rel="noreferrer" className="underline">Публичный URL</a>
        </div>
      </div>
      <LabBareLayout title={`Preview · ${exp.name}`} noindex>
        <LabExperimentHost experiment={exp} />
      </LabBareLayout>
    </div>
  )
}
