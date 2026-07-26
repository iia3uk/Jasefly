import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button, Field, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { adminUrl } from '@/admin/adminBasePath'
import { useAdminRouteParams } from '@/admin/AdminRouteParams'
import { useAuth } from '@/context/AuthContext'
import { usePluginEnabled } from '@/hooks/useApi'
import type { LabExperimentRow } from './LabListPage'

type LabEntry = { key: string; label: string; description?: string }

type LabExperimentDetail = LabExperimentRow & {
  settings_json?: unknown
  content_json?: unknown
}

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

function pretty(v: unknown): string {
  try {
    return JSON.stringify(v ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

const inputClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white'
const selectClass = inputClass

export function LabEditPage() {
  return (
    <RequirePermission permission="lab.view">
      <LabEditInner />
    </RequirePermission>
  )
}

function LabEditInner() {
  const { id = '' } = useAdminRouteParams()
  const isNew = id === 'new'
  const nav = useNavigate()
  const qc = useQueryClient()
  const { can } = useAuth()

  const pluginOn = usePluginEnabled('lab')

  const entriesQ = useQuery({
    queryKey: ['lab-entries'],
    enabled: pluginOn,
    queryFn: async () => asData<LabEntry[]>(await api.get('/admin/lab/entries')),
  })

  const itemQ = useQuery({
    queryKey: ['lab-experiment', id],
    enabled: pluginOn && !isNew && Boolean(id),
    queryFn: async () => asData<LabExperimentDetail>(await api.get(`/admin/lab/experiments/${id}`)),
  })

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [entryKey, setEntryKey] = useState('starter')
  const [status, setStatus] = useState('draft')
  const [isPublic, setIsPublic] = useState(false)
  const [noindex, setNoindex] = useState(true)
  const [renderMode, setRenderMode] = useState('embedded')
  const [settingsText, setSettingsText] = useState('{\n  "theme": "light"\n}')
  const [contentText, setContentText] = useState('{\n  "title": "Jasefly Lab Starter"\n}')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!itemQ.data) return
    const d = itemQ.data
    setName(d.name)
    setSlug(d.slug)
    setEntryKey(d.entry_key)
    setStatus(d.status)
    setIsPublic(Boolean(d.is_public))
    setNoindex(Boolean(d.noindex))
    setRenderMode(d.render_mode || 'embedded')
    setSettingsText(pretty(d.settings_json))
    setContentText(pretty(d.content_json))
  }, [itemQ.data])

  const readOnly = deletedGuard(itemQ.data) || (!isNew && !can('lab.update'))
  const deleted = deletedGuard(itemQ.data)

  const save = useMutation({
    mutationFn: async () => {
      let settings_json: unknown
      let content_json: unknown
      try {
        settings_json = JSON.parse(settingsText || '{}')
      } catch {
        throw new Error('Некорректный JSON: настройки')
      }
      try {
        content_json = JSON.parse(contentText || '{}')
      } catch {
        throw new Error('Некорректный JSON: контент')
      }
      const body = {
        name,
        slug,
        entry_key: entryKey,
        status,
        is_public: isPublic,
        noindex,
        render_mode: renderMode,
        settings_json,
        content_json,
      }
      if (isNew) {
        return asData<LabExperimentDetail>(await api.post('/admin/lab/experiments', body))
      }
      return asData<LabExperimentDetail>(await api.put(`/admin/lab/experiments/${id}`, body))
    },
    onSuccess: (row) => {
      setFormError(null)
      void qc.invalidateQueries({ queryKey: ['lab-experiments'] })
      void qc.invalidateQueries({ queryKey: ['lab-experiment', String(row.id)] })
      if (isNew) nav(adminUrl(`/lab/${row.id}`))
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const act = useMutation({
    mutationFn: async (action: string) => {
      if (action === 'delete') {
        await api.delete(`/admin/lab/experiments/${id}`)
        return null
      }
      if (action === 'restore') {
        return asData<LabExperimentDetail>(await api.post(`/admin/lab/experiments/${id}/restore`, {}))
      }
      return asData<LabExperimentDetail>(await api.post(`/admin/lab/experiments/${id}/${action}`, {}))
    },
    onSuccess: (row, action) => {
      void qc.invalidateQueries({ queryKey: ['lab-experiments'] })
      if (action === 'delete') {
        nav(adminUrl('/lab'))
        return
      }
      if (action === 'duplicate' && row) {
        nav(adminUrl(`/lab/${row.id}`))
        return
      }
      void qc.invalidateQueries({ queryKey: ['lab-experiment', id] })
    },
  })

  if (!isNew && itemQ.isLoading) {
    return <Skeleton className="h-64 w-full" />
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={adminUrl('/lab')} className="text-sm text-zinc-400 hover:underline">← К списку</Link>
          <h1 className="text-2xl font-semibold mt-1 text-white">{isNew ? 'Новый эксперимент' : name || 'Эксперимент'}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew && can('lab.preview') ? (
            <Link to={adminUrl(`/lab/${id}/preview`)}>
              <GhostButton type="button">Preview</GhostButton>
            </Link>
          ) : null}
          {!isNew && slug ? (
            <a href={`/lab/${slug}`} target="_blank" rel="noreferrer">
              <GhostButton type="button">Open public page</GhostButton>
            </a>
          ) : null}
          {!isNew && can('lab.publish') && !deleted ? (
            <>
              <Button type="button" onClick={() => act.mutate('activate')} disabled={act.isPending}>Activate</Button>
              <GhostButton type="button" onClick={() => act.mutate('disable')} disabled={act.isPending}>Disable</GhostButton>
              <GhostButton type="button" onClick={() => act.mutate('archive')} disabled={act.isPending}>Архив</GhostButton>
            </>
          ) : null}
          {!isNew && can('lab.create') && !deleted ? (
            <GhostButton type="button" onClick={() => act.mutate('duplicate')} disabled={act.isPending}>Duplicate</GhostButton>
          ) : null}
          {!isNew && can('lab.update') && !deleted ? (
            <GhostButton type="button" onClick={() => {
              if (confirm('Сбросить content_json и settings_json к дефолту entry?')) act.mutate('reset-content')
            }} disabled={act.isPending}>Reset content</GhostButton>
          ) : null}
          {!isNew && can('lab.delete') && !deleted ? (
            <GhostButton type="button" onClick={() => {
              if (confirm('Удалить эксперимент (soft delete)?')) act.mutate('delete')
            }} disabled={act.isPending}>Delete</GhostButton>
          ) : null}
          {!isNew && can('lab.delete') && deleted ? (
            <Button type="button" onClick={() => act.mutate('restore')} disabled={act.isPending}>Восстановить</Button>
          ) : null}
        </div>
      </div>

      {deleted ? (
        <div className="rounded-lg bg-amber-500/15 text-amber-200 px-4 py-3 text-sm">
          Эксперимент в корзине (soft delete). Восстановите, чтобы снова редактировать.
        </div>
      ) : null}

      <GlassPanel className="p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Название">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly && !isNew} />
          </Field>
          <Field label="Slug">
            <input className={inputClass} value={slug} onChange={(e) => setSlug(e.target.value)} disabled={readOnly && !isNew} />
          </Field>
          <Field label="Frontend entry">
            <select className={selectClass} value={entryKey} onChange={(e) => setEntryKey(e.target.value)} disabled={readOnly && !isNew}>
              {(entriesQ.data || [{ key: 'starter', label: 'Starter' }]).map((e) => (
                <option key={e.key} value={e.key}>{e.label} ({e.key})</option>
              ))}
            </select>
          </Field>
          <Field label="Статус">
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)} disabled={deleted || !can('lab.publish')}>
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
              <option value="archived">archived</option>
            </select>
          </Field>
          <Field label="Render mode">
            <select className={selectClass} value={renderMode} onChange={(e) => setRenderMode(e.target.value)} disabled={readOnly && !isNew}>
              <option value="embedded">embedded</option>
              <option value="iframe">iframe (задел)</option>
            </select>
          </Field>
          <div className="flex flex-col gap-3 justify-end pb-1">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} disabled={deleted || !can('lab.publish')} />
              Публичный (is_public)
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} disabled={readOnly && !isNew} />
              noindex, nofollow
            </label>
          </div>
        </div>

        <Field label="JSON-настройки (settings_json)">
          <textarea className={`${inputClass} font-mono text-xs min-h-[140px]`} value={settingsText} onChange={(e) => setSettingsText(e.target.value)} disabled={readOnly && !isNew} />
        </Field>
        <Field label="JSON-контент (content_json)">
          <textarea className={`${inputClass} font-mono text-xs min-h-[220px]`} value={contentText} onChange={(e) => setContentText(e.target.value)} disabled={readOnly && !isNew} />
        </Field>

        {formError ? <p className="text-sm text-red-400">{formError}</p> : null}

        {(isNew ? can('lab.create') : can('lab.update')) && !deleted ? (
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        ) : null}
      </GlassPanel>
    </div>
  )
}

function deletedGuard(row?: LabExperimentDetail): boolean {
  return Boolean(row?.deleted_at)
}
