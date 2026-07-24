import { Suspense, lazy, useMemo } from 'react'
import type { LabExperimentProps } from './experimentRegistry'
import { getExperimentLoader, hasExperimentEntry } from './experimentRegistry'

export type LabExperimentPayload = LabExperimentProps['experiment'] & {
  settings_json?: Record<string, unknown> | object
  content_json?: Record<string, unknown> | object
  settings?: Record<string, unknown>
  content?: Record<string, unknown>
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

export function LabExperimentHost({ experiment }: { experiment: LabExperimentPayload }) {
  const entryKey = experiment.entry_key
  const known = hasExperimentEntry(entryKey)

  const Comp = useMemo(() => {
    if (!known) return null
    const loader = getExperimentLoader(entryKey)
    if (!loader) return null
    return lazy(loader)
  }, [entryKey, known])

  if (!known || !Comp) {
    return (
      <div style={{ padding: '3rem 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ marginTop: 0 }}>Эксперимент недоступен</h1>
        <p>Неизвестный frontend entry: <code>{entryKey}</code>. Зарегистрируйте его в experimentRegistry.</p>
      </div>
    )
  }

  const content = asRecord(experiment.content ?? experiment.content_json)
  const settings = asRecord(experiment.settings ?? experiment.settings_json)

  const props: LabExperimentProps = {
    content,
    settings,
    experiment: {
      id: experiment.id,
      name: experiment.name,
      slug: experiment.slug,
      entry_key: experiment.entry_key,
      status: experiment.status,
      is_public: Boolean(experiment.is_public),
      noindex: Boolean(experiment.noindex),
      render_mode: experiment.render_mode || 'embedded',
      preview: experiment.preview,
    },
  }

  return (
    <Suspense fallback={<div style={{ padding: '3rem' }}>Загрузка эксперимента…</div>}>
      <Comp {...props} />
    </Suspense>
  )
}
