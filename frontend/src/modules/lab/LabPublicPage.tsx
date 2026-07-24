import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api, ApiRequestError } from '@/lib/api'
import { LabBareLayout } from './LabBareLayout'
import { LabExperimentHost, type LabExperimentPayload } from './LabExperimentHost'
import { siteHasPlugin } from '@/core/pluginGates'
import { useSiteContext } from '@/context/SiteContext'

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

export function LabPublicPage() {
  const { slug = '' } = useParams()
  const { site, loading: siteLoading } = useSiteContext()
  const pluginOn = siteHasPlugin(site?.enabled_plugins, 'lab')

  const q = useQuery({
    queryKey: ['lab-public', slug],
    enabled: Boolean(slug) && !siteLoading && pluginOn,
    queryFn: async () => asData<LabExperimentPayload>(await api.get(`/lab/${encodeURIComponent(slug)}`, { silent: true })),
    retry: false,
  })

  if (siteLoading) {
    return <LabBareLayout><div style={{ padding: '3rem' }}>Загрузка…</div></LabBareLayout>
  }

  if (!pluginOn) {
    return (
      <LabBareLayout title="Не найдено" noindex>
        <div style={{ padding: '3rem 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1>Страница не найдена</h1>
        </div>
      </LabBareLayout>
    )
  }

  if (q.isLoading) {
    return <LabBareLayout><div style={{ padding: '3rem' }}>Загрузка…</div></LabBareLayout>
  }

  if (q.isError || !q.data) {
    const err = q.error
    const code = err instanceof ApiRequestError
      ? (err.details.raw as { errors?: { code?: string } } | undefined)?.errors?.code
      : undefined
    const status = err instanceof ApiRequestError ? err.details.status : undefined

    return (
      <LabBareLayout title="Эксперимент недоступен" noindex>
        <div style={{ padding: '3rem 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ marginTop: 0 }}>
            {code === 'unknown_entry' ? 'Неизвестный entry' : 'Эксперимент недоступен'}
          </h1>
          <p>
            {code === 'unknown_entry'
              ? 'Frontend entry не зарегистрирован в whitelist.'
              : status === 404
                ? 'Черновик, отключённый или непубличный эксперимент.'
                : 'Не удалось открыть эксперимент.'}
          </p>
        </div>
      </LabBareLayout>
    )
  }

  const exp = q.data
  return (
    <LabBareLayout
      title={exp.name}
      noindex={Boolean(exp.noindex) || Boolean(exp.preview)}
      path={`/lab/${exp.slug}`}
    >
      {exp.preview ? (
        <div style={{
          background: '#fef3c7',
          color: '#92400e',
          padding: '0.5rem 1rem',
          fontSize: '0.85rem',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}>
          Режим предпросмотра (не публичная версия)
        </div>
      ) : null}
      <LabExperimentHost experiment={exp} />
    </LabBareLayout>
  )
}
