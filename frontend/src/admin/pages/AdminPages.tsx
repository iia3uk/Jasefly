import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Copy, ExternalLink, GripVertical, Plus, Trash2 } from 'lucide-react'
import { endpoints } from '@/lib/api'
import { useAdminItem, useAdminList, useAdminSingleton, useCrud, usePluginEnabled, useSingletonSave } from '@/hooks/useApi'
import type { BlogPost, ID, Profile, Project } from '@/types'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { RichTextEditor } from '@/admin/components/RichTextEditor'
import { MediaPicker } from '@/admin/components/MediaPicker'
import { GalleryPicker } from '@/admin/components/GalleryPicker'
import { IconPicker } from '@/admin/components/IconPicker'
import { BlueprintForm } from '@/admin/components/BlueprintForm'
import { getBlueprints } from '@/core/moduleRegistry'
import { AppIcon } from '@/shared/icons'
import { AdminSplitLayout, adminFormFullClass, adminFormGridClass } from '@/admin/components/AdminSplitLayout'
import { PageContext } from '@/admin/components/PageContext'
import { BlogPostPreview, CrudItemPreview, ListContextPreview, ProfilePreview, ProjectPreview } from '@/admin/preview'
import { t, fieldLabel, resourceTitle, pageTitle } from '@/admin/i18n'
import { getContext, resolvePublicUrl } from '@/admin/context/registry'
import { skillRankFromPercent } from '@/shared/skillRank'
import { useAdminSaveHotkey, useHydratedForm, useUnsavedGuard } from '@/admin/hooks/useAdminFormGuards'
import { useFormAutosave } from '@/admin/hooks/useFormAutosave'
import { clearDraft } from '@/admin/lib/prefs'
import { useAdminRouteParams } from '@/admin/AdminRouteParams'
import { adminUrl } from '@/admin/adminBasePath'

type Data = Record<string, any>
const inputClass = 'w-full'
const asText = (v: unknown) => Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : x.name).join(', ') : String(v ?? '')
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-2 text-sm text-zinc-300"><span>{label}</span>{children}</label> }
function Text({ label, value, onChange, type = 'text' }: { label: string; value?: unknown; onChange: (v: string) => void; type?: string }) { return <Field label={label}><input className={inputClass} type={type} value={String(value ?? '')} onChange={e => onChange(e.target.value)} /></Field> }
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value?: unknown
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  const current = String(value ?? '')
  const known = options.some((o) => o.value === current)
  return (
    <Field label={label}>
      <select className={inputClass} value={known ? current : (options[0]?.value ?? '')} onChange={(e) => onChange(e.target.value)}>
        {!known && current !== '' && (
          <option value={current}>{current} (текущее)</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  )
}
function Check({ label, checked, onChange }: { label: string; checked?: unknown; onChange: (v: boolean) => void }) { return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(checked)} onChange={e => onChange(e.target.checked)} />{label}</label> }
function SaveBar({ saving, error, onSave, label = t.saveChanges, children }: { saving?: boolean; error?: string; onSave: () => void; label?: string; children?: ReactNode }) { return <div className="sticky bottom-4 z-20 mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#151518]/95 p-3 backdrop-blur"><Button type="button" disabled={saving} onClick={onSave}>{saving ? t.saving : label}</Button>{children}{error && <span className="text-sm text-red-400">{error}</span>}</div> }

function listItemTitle(item: Data): string {
  const primary = item.title ?? item.name ?? item.company ?? item.institution ?? item.author_name ?? item.label ?? item.platform ?? item.section_key
  if (primary != null && String(primary).trim() !== '') return String(primary)
  const secondary = item.url ?? item.href ?? item.role ?? item.short_description
  if (secondary != null && String(secondary).trim() !== '') return String(secondary)
  return item.id != null ? `${t.untitled} #${item.id}` : t.untitled
}

function listItemSubtitle(item: Data, resource: string): string {
  if (resource === 'skills' && item.percentage != null) {
    return skillRankFromPercent(Number(item.percentage)).label
  }
  const parts = [
    item.platform && item.label ? item.platform : null,
    item.short_description,
    item.role,
    item.url,
    item.href,
    item.description,
  ].filter((x) => x != null && String(x).trim() !== '')
  const title = listItemTitle(item)
  return parts.map(String).find((p) => p !== title) ?? ''
}

function statusBadge(status?: string) {
  if (!status) return null
  const published = status === 'published'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${published ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'}`}>
      {published ? t.statusPublished : t.statusDraft}
    </span>
  )
}

function duplicatePayload(item: Data, resource: string): Data {
  const skip = new Set(['id', 'created_at', 'updated_at', 'deleted_at', 'published_at'])
  const next: Data = {}
  for (const [k, v] of Object.entries(item)) {
    if (skip.has(k)) continue
    next[k] = v
  }
  const titleKey = ['title', 'name', 'label', 'company', 'author_name', 'platform'].find((k) => next[k] != null && String(next[k]).trim() !== '')
  if (titleKey) next[titleKey] = `${String(next[titleKey])}${t.copySuffix}`
  if (next.slug) next.slug = `${String(next.slug)}-copy`
  if (resource === 'blog' || resource === 'projects') next.status = 'draft'
  return next
}

const resourceFields: Record<string, string[]> = {
  experience: ['company', 'role', 'location', 'start_date', 'end_date', 'technologies', 'description'],
  education: ['institution', 'degree', 'field_of_study', 'start_date', 'end_date', 'description'],
  'skill-categories': ['name', 'slug', 'description'],
  skills: ['category_id', 'name', 'percentage', 'icon', 'sort_order'],
  services: ['title', 'slug', 'short_description', 'description', 'icon', 'price_label', 'features'],
  testimonials: ['author_name', 'author_role', 'author_company', 'content', 'rating'],
  navigation: ['label', 'href', 'target', 'location', 'sort_order'],
  statistics: ['label', 'value', 'suffix', 'icon', 'sort_order'],
  'social-links': ['platform', 'label', 'url', 'icon', 'sort_order'],
}

function useDirtyForm(form: Data, baseline: Data | null) {
  const baselineJson = useMemo(() => (baseline ? JSON.stringify(baseline) : null), [baseline])
  const dirty = baselineJson != null && JSON.stringify(form) !== baselineJson
  return { dirty, baselineJson }
}

export function CrudListPage({ resource, basePath }: { resource: string; basePath?: string }) {
  const { data = [], isLoading } = useAdminList<Data>(resource)
  const { remove, save } = useCrud(resource)
  const client = useQueryClient()
  const nav = useNavigate()
  const [filter, setFilter] = useState('')
  const canReorder = resource === 'projects' || resource === 'navigation' || resource === 'skills'
  const [reorderMode, setReorderMode] = useState(false)
  const [ordered, setOrdered] = useState<Data[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const path = basePath ?? (resource === 'contact-messages' ? 'messages' : resource)
  const ctx = getContext(resource)
  const sample = data[0]
  const sampleTitle = sample ? listItemTitle(sample) : undefined
  const hasStatus = resource === 'blog' || resource === 'projects'

  useEffect(() => {
    if (reorderMode) setOrdered(data.slice())
  }, [data, reorderMode])

  const filtered = useMemo(() => {
    if (reorderMode && canReorder) return ordered
    const q = filter.trim().toLowerCase()
    if (!q) return data
    return data.filter((item) => {
      const hay = [
        listItemTitle(item),
        listItemSubtitle(item, resource),
        item.slug,
        item.status,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [canReorder, data, filter, ordered, reorderMode, resource])

  const reorder = useMutation({
    mutationFn: (ids: Array<number | string>) => endpoints.reorder(resource, ids),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin', resource] }),
    onError: (e) => {
      window.alert(e instanceof Error ? e.message : t.reorderFailed)
      setOrdered(data.slice())
    },
  })

  const persistOrder = (next: Data[]) => {
    setOrdered(next)
    void reorder.mutateAsync(next.map((item) => item.id as number | string))
  }

  const moveItem = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    const next = ordered.slice()
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    persistOrder(next)
  }

  const onDropAt = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const from = ordered.findIndex((item) => String(item.id) === dragId)
    const to = ordered.findIndex((item) => String(item.id) === targetId)
    if (from < 0 || to < 0) return
    const next = ordered.slice()
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    setDragId(null)
    persistOrder(next)
  }

  const onDuplicate = async (item: Data) => {
    try {
      const created = await save.mutateAsync({ data: duplicatePayload(item, resource) })
      const newId = (created as Data)?.id
      if (newId != null) nav(adminUrl(`/${path}/${newId}`))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось дублировать')
    }
  }

  return (
    <AdminSplitLayout
      title={resourceTitle(resource)}
      contextKey={resource}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {canReorder && (
            <Button
              type="button"
              className={reorderMode ? 'border border-cyan-400/30 bg-cyan-500/10 text-cyan-100' : undefined}
              onClick={() => {
                setReorderMode((v) => !v)
                setFilter('')
              }}
            >
              <GripVertical size={16} />
              {reorderMode ? t.reorderModeExit : t.reorderMode}
            </Button>
          )}
          <Link to={adminUrl(`/${path}/new`)}><Button><Plus size={16} />{t.newItem}</Button></Link>
        </div>
      )}
      form={
        <div className="space-y-3">
          {reorderMode && canReorder ? (
            <p className="text-xs text-zinc-500">
              {reorder.isPending ? t.reorderSaving : t.reorderHint}
            </p>
          ) : (
            <input
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
              placeholder={t.filterList}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          <GlassPanel className="overflow-hidden">
            {isLoading ? <Skeleton className="h-64" /> : !filtered.length ? (
              <p className="p-10 text-center text-zinc-500">{t.noItems}</p>
            ) : (
              <div className="divide-y divide-white/10">
                {filtered.map((item, index) => {
                  const title = listItemTitle(item)
                  const subtitle = listItemSubtitle(item, resource)
                  const sparse = !item.title && !item.name && !item.label && !item.company && !item.platform
                  const publicUrl = hasStatus
                    ? resolvePublicUrl(ctx, item.slug, item.status)
                    : resolvePublicUrl(ctx, item.slug, 'published')
                  const idKey = String(item.id)
                  return (
                    <div
                      className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4 ${
                        dragId === idKey ? 'bg-cyan-500/5' : ''
                      }`}
                      key={idKey}
                      draggable={reorderMode && canReorder}
                      onDragStart={() => {
                        if (reorderMode && canReorder) setDragId(idKey)
                      }}
                      onDragOver={(e) => {
                        if (reorderMode && canReorder) e.preventDefault()
                      }}
                      onDrop={() => {
                        if (reorderMode && canReorder) onDropAt(idKey)
                      }}
                      onDragEnd={() => setDragId(null)}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        {reorderMode && canReorder && (
                          <div className="mt-1 flex shrink-0 flex-col items-center gap-0.5 text-zinc-500">
                            <GripVertical size={16} className="cursor-grab" aria-hidden />
                            <div className="flex gap-0.5">
                              <button
                                type="button"
                                title={t.moveUp}
                                disabled={index === 0 || reorder.isPending}
                                className="rounded p-1 hover:bg-white/10 disabled:opacity-30"
                                onClick={() => moveItem(index, -1)}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                title={t.moveDown}
                                disabled={index === filtered.length - 1 || reorder.isPending}
                                className="rounded p-1 hover:bg-white/10 disabled:opacity-30"
                                onClick={() => moveItem(index, 1)}
                              >
                                <ArrowDown size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                        <Link className="flex min-w-0 flex-1 items-start gap-3 rounded-lg py-0.5 hover:bg-white/[0.03]" to={adminUrl(`/${path}/${item.id}`)}>
                          {item.icon != null && String(item.icon).trim() !== '' && (
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                              <AppIcon name={String(item.icon)} size={16} />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <b className={`break-words ${sparse ? 'text-zinc-400' : ''}`}>{title}</b>
                              {hasStatus && statusBadge(item.status)}
                            </span>
                            {!!subtitle && <p className="truncate text-sm text-zinc-500">{subtitle}</p>}
                          </span>
                        </Link>
                      </div>
                      {!reorderMode && (
                        <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                          {publicUrl.href && (
                            <a
                              href={publicUrl.href}
                              target="_blank"
                              rel="noreferrer"
                              title={t.openOnSite}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white"
                            >
                              <ExternalLink size={15} />
                            </a>
                          )}
                          <Button
                            type="button"
                            className="px-2"
                            title={t.duplicate}
                            onClick={(e) => {
                              e.preventDefault()
                              void onDuplicate(item)
                            }}
                          >
                            <Copy size={15} />
                          </Button>
                          <Button
                            type="button"
                            className="px-2 text-red-300"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (confirm(t.deleteConfirm)) remove.mutate(item.id as ID)
                            }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </GlassPanel>
        </div>
      }
      preview={<ListContextPreview where={ctx.where} sampleTitle={sampleTitle} />}
    />
  )
}

export function CrudEditPage({ resource, basePath }: { resource: string; basePath?: string }) {
  const { id = 'new' } = useAdminRouteParams()
  const { data, isLoading } = useAdminItem<Data>(resource, id)
  const { data: skillCategories = [] } = useAdminList<Data>('skill-categories', resource === 'skills')
  const { save } = useCrud(resource)
  const nav = useNavigate()
  const { form, setForm, baseline } = useHydratedForm<Data>(data, String(id))
  const set = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }))
  const { dirty, baselineJson } = useDirtyForm(form, baseline)
  useUnsavedGuard(dirty)
  const { bannerNode, clearDraftLocal } = useFormAutosave(resource, id, form, baselineJson, dirty, (d) => setForm(d))

  const submit = useCallback(() => {
    save.mutate({
      data: {
        ...form,
        percentage: form.percentage != null && form.percentage !== '' ? Number(form.percentage) : undefined,
        category_id: form.category_id != null && form.category_id !== '' ? Number(form.category_id) : undefined,
        sort_order: form.sort_order != null && form.sort_order !== '' ? Number(form.sort_order) : undefined,
        technologies: form.technologies ? asText(form.technologies).split(',').map(x => x.trim()).filter(Boolean) : undefined,
        features: form.features ? asText(form.features).split(',').map(x => x.trim()).filter(Boolean) : undefined,
      },
      id: id === 'new' ? undefined : id,
    }, {
      onSuccess: () => {
        clearDraftLocal()
        clearDraft(resource, id)
        nav(adminUrl(`/${basePath ?? resource}`))
      },
    })
  }, [save, form, id, clearDraftLocal, nav, basePath, resource])

  useAdminSaveHotkey(submit)

  if (isLoading) return <Skeleton className="h-96" />

  return (
    <AdminSplitLayout
      title={pageTitle(resource, id === 'new')}
      contextKey={resource}
      form={
        <>
          {bannerNode}
          <GlassPanel className={adminFormGridClass}>
            {(() => {
              // Blueprint-driven fields take precedence when a blueprint is
              // registered for this resource; otherwise fall back to the
              // legacy hardcoded field list.
              const bp = getBlueprints()[resource]
              if (bp) {
                return <BlueprintForm blueprint={bp} form={form} set={set} />
              }
              const fields = resourceFields[resource] ?? []
              return fields.map(key => {
              if (key === 'description' || key === 'content') {
                return (
                  <div key={key} className={adminFormFullClass}>
                    <Field label={fieldLabel(key)}><textarea value={String(form[key] ?? '')} onChange={e => set(key, e.target.value)} /></Field>
                  </div>
                )
              }
              if (key === 'category_id' && resource === 'skills') {
                return (
                  <Field key={key} label={fieldLabel(key)}>
                    <select
                      className={inputClass}
                      value={String(form.category_id ?? '')}
                      onChange={e => set('category_id', e.target.value ? Number(e.target.value) : '')}
                    >
                      <option value="">Выберите категорию</option>
                      {skillCategories.map((cat) => (
                        <option key={String(cat.id)} value={String(cat.id)}>{cat.name}</option>
                      ))}
                    </select>
                  </Field>
                )
              }
              if (key === 'percentage') {
                const previewRank = skillRankFromPercent(Number(form.percentage || 0))
                return (
                  <Field key={key} label={fieldLabel(key)}>
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      max={100}
                      value={String(form.percentage ?? '')}
                      onChange={e => set('percentage', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    <p className="mt-1.5 text-xs text-zinc-500">
                      На сайте: {previewRank.label} · {previewRank.filled}/{previewRank.total} клеток
                      {' '}(0 Новичок → 90+ Мастер)
                    </p>
                  </Field>
                )
              }
              if (key === 'icon') {
                return (
                  <div key={key} className={adminFormFullClass}>
                    <IconPicker value={form.icon} onChange={(v) => set('icon', v)} label={fieldLabel(key)} />
                  </div>
                )
              }
              const type = key.includes('date') ? 'date' : key === 'rating' || key === 'sort_order' ? 'number' : 'text'
              return <Text key={key} label={fieldLabel(key)} type={type} value={form[key]} onChange={v => set(key, v)} />
              })
            })()}
            {resource === 'experience' && <Check label={t.currentRole} checked={form.is_current} onChange={v => set('is_current', v)} />}
            {resource === 'navigation' && <Check label={t.visible} checked={form.is_visible} onChange={v => set('is_visible', v)} />}
            {resource === 'skills' && <Check label={t.visible} checked={form.is_visible !== false} onChange={v => set('is_visible', v)} />}
          </GlassPanel>
          <SaveBar saving={save.isPending} error={save.error?.message} onSave={submit} />
        </>
      }
      preview={<CrudItemPreview form={form} resource={resource} />}
    />
  )
}

export function ProfilePage() {
  const { data, isLoading } = useAdminSingleton<Profile>('profile')
  const save = useSingletonSave('profile')
  const { form, setForm, baseline, setBaseline } = useHydratedForm<Profile>(data, 'singleton')
  const set = (k: keyof Profile, v: any) => setForm(p => ({ ...p, [k]: v }))
  const { dirty, baselineJson } = useDirtyForm(form as Data, baseline as Data | null)
  useUnsavedGuard(dirty)
  const { bannerNode, clearDraftLocal } = useFormAutosave('profile', 'singleton', form as Data, baselineJson, dirty, (d) => setForm(d as Profile))

  const onSave = useCallback(() => {
    save.mutate({
      ...form,
      photo_media_id: form.photo_media_id || form.avatar_media_id || null,
      avatar_media_id: form.avatar_media_id || form.photo_media_id || null,
    }, {
      onSuccess: () => {
        clearDraftLocal()
        setBaseline(form)
      },
    })
  }, [save, form, clearDraftLocal, setBaseline])

  useAdminSaveHotkey(onSave)

  return (
    <AdminSplitLayout
      title={t.profile}
      contextKey="profile"
      form={
        <>
          {bannerNode}
          {isLoading ? <Skeleton className="h-96" /> : (
            <GlassPanel className={adminFormGridClass}>
              <Text label={fieldLabel('name')} value={form.name} onChange={v => set('name', v)} />
              <Text label={fieldLabel('job_title')} value={form.job_title} onChange={v => set('job_title', v)} />
              <Text label={fieldLabel('location')} value={form.location} onChange={v => set('location', v)} />
              <Text label={fieldLabel('availability_status')} value={form.availability_status} onChange={v => set('availability_status', v)} />
              <Text label={fieldLabel('years_experience')} type="number" value={form.years_experience} onChange={v => set('years_experience', Number(v))} />
              <Field label={fieldLabel('short_bio')}><textarea value={form.short_bio ?? ''} onChange={e => set('short_bio', e.target.value)} /></Field>
              <div className={adminFormFullClass}><Field label={fieldLabel('bio')}><RichTextEditor value={form.bio} onChange={v => set('bio', v)} /></Field></div>
              <MediaPicker label={fieldLabel('photo')} value={form.photo_media_id} onChange={v => set('photo_media_id', v)} />
              <MediaPicker label={fieldLabel('avatar')} value={form.avatar_media_id} onChange={v => set('avatar_media_id', v)} />
              <MediaPicker label={fieldLabel('resume')} value={form.resume_media_id} onChange={v => set('resume_media_id', v)} />
            </GlassPanel>
          )}
          <SaveBar saving={save.isPending} error={save.error?.message} onSave={onSave} />
        </>
      }
      preview={<ProfilePreview form={form} />}
    />
  )
}

function Repeatable({ label, values, onChange }: { label: string; values?: any[]; onChange: (v: any[]) => void }) {
  const rows = values ?? []
  return (
    <Field label={label}>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div className="flex gap-2" key={i}>
            <input
              value={typeof row === 'string' ? row : row.title ?? row.name ?? ''}
              onChange={e => onChange(rows.map((r, x) => x === i ? (typeof r === 'string' ? e.target.value : { ...r, title: e.target.value }) : r))}
            />
            <Button type="button" className="px-2" onClick={() => onChange(rows.filter((_, x) => x !== i))}><Trash2 size={15} /></Button>
          </div>
        ))}
        <Button type="button" onClick={() => onChange([...rows, ''])}>{t.add}</Button>
      </div>
    </Field>
  )
}

export function ProjectEditPage() {
  const { id = 'new' } = useAdminRouteParams()
  const { data, isLoading } = useAdminItem<Project>('projects', id)
  const crud = useCrud('projects')
  const nav = useNavigate()
  const client = useQueryClient()
  const { form, setForm, baseline, setBaseline, resetHydration } = useHydratedForm<Data>(data as Data | undefined, String(id))

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
  const { dirty, baselineJson } = useDirtyForm(form, baseline)
  useUnsavedGuard(dirty)
  const { bannerNode, clearDraftLocal } = useFormAutosave('projects', id, form, baselineJson, dirty, (d) => setForm(d))

  const normalizeGallery = (items: unknown) => {
    if (!Array.isArray(items)) return []
    return items
      .map((item: any, i: number) => {
        const url = typeof item === 'object' && item != null ? String(item.url || '').trim() : ''
        const mediaId =
          typeof item === 'object' && item != null
            ? (item.media_id ?? null)
            : item
        const hasMedia = mediaId != null && mediaId !== ''
        if (!hasMedia && !url) return null
        return {
          media_id: hasMedia ? mediaId : null,
          url: url || null,
          caption: typeof item === 'object' ? (item.caption ?? null) : null,
          media_type: typeof item === 'object'
            ? (item.media_type
              ?? ((url || String(item.media_mime || item.mime_type || '').startsWith('video/')) ? 'video' : 'gallery'))
            : 'gallery',
          media_mime: typeof item === 'object' ? (item.media_mime ?? item.mime_type ?? null) : null,
          sort_order: typeof item === 'object' ? (item.sort_order ?? i) : i,
        }
      })
      .filter(Boolean)
  }

  const submit = useCallback((status?: string) => {
    crud.save.mutate({
      data: {
        ...form,
        status: status ?? form.status,
        tags: asText(form.tags).split(',').map(name => ({ name: name.trim() })).filter(x => x.name),
        media: normalizeGallery(form.media),
      },
      id: id === 'new' ? undefined : id,
    }, {
      onSuccess: result => {
        const saved = result as Project
        setForm(saved)
        setBaseline(saved)
        // Keep hydration locked on the saved id so invalidateQueries cannot wipe the form.
        if (String(saved.id ?? id) !== String(id)) resetHydration()
        clearDraftLocal()
        void client.invalidateQueries({ queryKey: ['project'] })
        void client.invalidateQueries({ queryKey: ['projects'] })
        if (status && id !== 'new') endpoints.publish('projects', id, status)
        nav(adminUrl(`/projects/${saved.id ?? id}`))
      },
    })
  }, [crud.save, form, id, clearDraftLocal, client, nav, resetHydration, setForm, setBaseline])

  const saveDraft = useCallback(() => submit('draft'), [submit])
  useAdminSaveHotkey(saveDraft)

  if (isLoading) return <Skeleton className="h-96" />

  return (
    <AdminSplitLayout
      title={id === 'new' ? t.newProject : t.editProject}
      contextKey="projects"
      slug={form.slug}
      status={form.status}
      form={
        <>
          {bannerNode}
          <GlassPanel className={adminFormGridClass}>
            <Text label={fieldLabel('title')} value={form.title} onChange={v => set('title', v)} />
            <Text label={fieldLabel('slug')} value={form.slug} onChange={v => set('slug', v)} />
            <Select
              label={fieldLabel('project_status')}
              value={form.project_status}
              onChange={v => set('project_status', v)}
              options={[
                { value: 'completed', label: t.projectStatusCompleted },
                { value: 'in_progress', label: t.projectStatusInProgress },
                { value: 'on_hold', label: t.projectStatusOnHold },
                { value: 'concept', label: t.projectStatusConcept },
                { value: 'cancelled', label: t.projectStatusCancelled },
              ]}
            />
            <Text label={fieldLabel('role')} value={form.role} onChange={v => set('role', v)} />
            <Text label={fieldLabel('github_url')} value={form.github_url} onChange={v => set('github_url', v)} />
            <Text label={fieldLabel('website_url')} value={form.website_url} onChange={v => set('website_url', v)} />
            <Text label={fieldLabel('video_url')} value={form.video_url} onChange={v => set('video_url', v)} />
            <Text label={fieldLabel('tags')} value={asText(form.tags)} onChange={v => set('tags', v)} />
            <Check label={t.featured} checked={form.is_featured} onChange={v => set('is_featured', v)} />
            <MediaPicker label={fieldLabel('cover_image')} value={form.cover_media_id} onChange={v => set('cover_media_id', v)} />
            <div className={adminFormFullClass}>
              <GalleryPicker value={form.media} onChange={v => set('media', v)} />
            </div>
            <div className={adminFormFullClass}><Field label={fieldLabel('short_description')}><textarea value={form.short_description ?? ''} onChange={e => set('short_description', e.target.value)} /></Field></div>
            <div className={adminFormFullClass}><Field label={fieldLabel('content')}><RichTextEditor value={form.content ?? form.description ?? ''} onChange={v => set('content', v)} /></Field></div>
            <Text label={fieldLabel('seo_title')} value={form.seo_title} onChange={v => set('seo_title', v)} />
            <div className={adminFormFullClass}><Field label={fieldLabel('seo_description')}><textarea value={form.seo_description ?? ''} onChange={e => set('seo_description', e.target.value)} /></Field></div>
            <Repeatable label={fieldLabel('technologies')} values={form.technologies} onChange={v => set('technologies', v)} />
            <Repeatable label={fieldLabel('features')} values={form.features} onChange={v => set('features', v)} />
            <Repeatable label={fieldLabel('timeline')} values={form.timeline} onChange={v => set('timeline', v)} />
            {id !== 'new' && <ProjectLinkedPosts projectId={form.id ?? id} />}
          </GlassPanel>
          <SaveBar saving={crud.save.isPending} error={crud.save.error?.message} onSave={() => submit('draft')} label={t.saveDraft}>
            <Button type="button" onClick={() => submit('published')}>{t.publish}</Button>
          </SaveBar>
        </>
      }
      preview={<ProjectPreview form={form} />}
    />
  )
}

function ProjectLinkedPosts({ projectId }: { projectId: unknown }) {
  const { data: posts = [], isLoading } = useAdminList<BlogPost>('blog')
  const linked = useMemo(
    () => posts.filter((p) => String(p.project_id ?? '') === String(projectId ?? '')),
    [posts, projectId],
  )
  return (
    <div className={adminFormFullClass}>
      <p className="mb-2 text-sm text-zinc-300">{t.linkedBlogPosts}</p>
      <p className="mb-3 text-xs text-zinc-500">{t.linkedBlogPostsHint}</p>
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : linked.length === 0 ? (
        <p className="text-sm text-zinc-500">{t.linkedBlogPostsEmpty}</p>
      ) : (
        <ul className="space-y-1.5">
          {linked.map((post) => (
            <li key={String(post.id)}>
              <Link to={adminUrl(`/blog/${post.id}`)} className="text-sm text-[var(--accent)] underline-offset-2 hover:underline">
                {post.title || `#${post.id}`}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function BlogEditPage() {
  const { id = 'new' } = useAdminRouteParams()
  const { data } = useAdminItem<BlogPost>('blog', id)
  const projectsOn = usePluginEnabled('projects')
  const { data: projects = [] } = useAdminList<Project>('projects', projectsOn)
  const crud = useCrud('blog')
  const nav = useNavigate()
  const { form, setForm, baseline, setBaseline } = useHydratedForm<Data>(data as Data | undefined, String(id))
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
  const { dirty, baselineJson } = useDirtyForm(form, baseline)
  useUnsavedGuard(dirty)
  const { bannerNode, clearDraftLocal } = useFormAutosave('blog', id, form, baselineJson, dirty, (d) => setForm(d))

  const projectOptions = useMemo(
    () => [
      { value: '', label: '— не привязан —' },
      ...projects.map((p) => ({ value: String(p.id), label: String(p.title || `#${p.id}`) })),
    ],
    [projects],
  )

  const submit = useCallback((status: string) => {
    const projectId = form.project_id === '' || form.project_id == null ? null : Number(form.project_id)
    crud.save.mutate({
      data: {
        ...form,
        status,
        project_id: Number.isFinite(projectId as number) ? projectId : null,
      },
      id: id === 'new' ? undefined : id,
    }, {
      onSuccess: r => {
        clearDraftLocal()
        setBaseline({ ...form, status, project_id: projectId })
        if (id !== 'new') endpoints.publish('blog', id, status)
        nav(adminUrl(`/blog/${(r as any).id ?? id}`))
      },
    })
  }, [crud.save, form, id, clearDraftLocal, nav, setBaseline])

  const saveDraft = useCallback(() => submit('draft'), [submit])
  useAdminSaveHotkey(saveDraft)

  return (
    <AdminSplitLayout
      title={id === 'new' ? t.newPost : t.editPost}
      contextKey="blog"
      slug={form.slug}
      status={form.status}
      form={
        <>
          {bannerNode}
          <GlassPanel className={adminFormGridClass}>
            <Text label={fieldLabel('title')} value={form.title} onChange={v => set('title', v)} />
            <Text label={fieldLabel('slug')} value={form.slug} onChange={v => set('slug', v)} />
            {projectsOn ? (
              <Select
                label={fieldLabel('project_id')}
                value={form.project_id ?? ''}
                onChange={v => set('project_id', v === '' ? null : v)}
                options={projectOptions}
              />
            ) : null}
            <Text label={fieldLabel('seo_title')} value={form.seo_title} onChange={v => set('seo_title', v)} />
            <Text label={fieldLabel('tags')} value={asText(form.tags)} onChange={v => set('tags', v)} />
            <div className={adminFormFullClass}><Field label={fieldLabel('excerpt')}><textarea value={form.excerpt ?? ''} onChange={e => set('excerpt', e.target.value)} /></Field></div>
            <MediaPicker label={fieldLabel('cover_image')} value={form.cover_media_id} onChange={v => set('cover_media_id', v)} />
            <div className={adminFormFullClass}><Field label={fieldLabel('content')}><RichTextEditor value={form.content} onChange={v => set('content', v)} /></Field></div>
            <div className={adminFormFullClass}><Field label={fieldLabel('seo_description')}><textarea value={form.seo_description ?? ''} onChange={e => set('seo_description', e.target.value)} /></Field></div>
          </GlassPanel>
          <SaveBar saving={crud.save.isPending} error={crud.save.error?.message} onSave={() => submit('draft')} label={t.saveDraft}>
            <Button type="button" onClick={() => submit('published')}>{t.publish}</Button>
          </SaveBar>
        </>
      }
      preview={<BlogPostPreview form={form} />}
    />
  )
}

/** Re-export for list pages that only need the banner */
export { PageContext }
