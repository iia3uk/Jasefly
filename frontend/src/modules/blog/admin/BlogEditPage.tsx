import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Eye, FilePenLine, PanelRightClose, PanelRightOpen, Settings2,
} from 'lucide-react'
import { endpoints } from '@/lib/api'
import {
  useAdminItem, useAdminList, useCrud, usePluginEnabled, usePluginsHydrated,
} from '@/hooks/useApi'
import type { BlogPost, Project } from '@/types'
import { Button, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { MediaPicker } from '@/admin/components/MediaPicker'
import { BlogPostPreview } from '@/admin/preview'
import { t, fieldLabel } from '@/admin/i18n'
import { useAdminSaveHotkey, useHydratedForm, useUnsavedGuard } from '@/admin/hooks/useAdminFormGuards'
import { useFormAutosave } from '@/admin/hooks/useFormAutosave'
import { useAdminRouteParams } from '@/admin/AdminRouteParams'
import { adminUrl } from '@/admin/adminBasePath'
import { mediaUrl } from '@/lib/api'
import { BlogComposer } from './BlogComposer'

type Data = Record<string, unknown>

const asText = (v: unknown) =>
  Array.isArray(v)
    ? v.map((x) => (typeof x === 'string' ? x : (x as { name?: string }).name)).join(', ')
    : String(v ?? '')

function useDirtyForm(form: Data, baseline: Data | null) {
  const baselineJson = useMemo(() => (baseline ? JSON.stringify(baseline) : null), [baseline])
  const dirty = baselineJson != null && JSON.stringify(form) !== baselineJson
  return { dirty, baselineJson }
}

function slugifyTitle(title: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  }
  return title
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function PluginOffNotice() {
  return (
    <GlassPanel className="p-10 text-center text-zinc-400">
      Плагин «Блог» выключен. Включите его в системе, чтобы редактировать посты.
    </GlassPanel>
  )
}

/**
 * Ghost/Medium-style writing studio for blog posts.
 * Canvas for writing; meta (SEO/cover/tags) in a side drawer; preview without unmounting the editor.
 */
export function BlogEditPage() {
  const { id = 'new' } = useAdminRouteParams()
  const pluginsReady = usePluginsHydrated()
  const blogOn = usePluginEnabled('blog')
  const { data } = useAdminItem<BlogPost>('blog', id, blogOn)
  const projectsOn = usePluginEnabled('projects')
  const { data: projects = [] } = useAdminList<Project>('projects', projectsOn)
  const crud = useCrud('blog')
  const nav = useNavigate()

  const { form, setForm, baseline, setBaseline } = useHydratedForm<Data>(data as Data | undefined, String(id))
  const set = useCallback((k: string, v: unknown) => {
    setForm((p) => ({ ...p, [k]: v }))
  }, [setForm])

  const { dirty, baselineJson } = useDirtyForm(form, baseline)
  useUnsavedGuard(dirty)
  const { bannerNode, clearDraftLocal } = useFormAutosave('blog', id, form, baselineJson, dirty, (d) => setForm(d))

  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [metaOpen, setMetaOpen] = useState(false)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const slugLocked = useRef(id !== 'new')

  useEffect(() => {
    slugLocked.current = id !== 'new'
  }, [id])

  const projectOptions = useMemo(
    () => [
      { value: '', label: '— не привязан —' },
      ...projects.map((p) => ({ value: String(p.id), label: String(p.title || `#${p.id}`) })),
    ],
    [projects],
  )

  const coverSrc = useMemo(() => {
    if (form.cover) return mediaUrl(form.cover as never)
    if (form.cover_media_id) return mediaUrl(form.cover_media_id as string | number)
    return undefined
  }, [form.cover, form.cover_media_id])

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
      onSuccess: (r) => {
        clearDraftLocal()
        setBaseline({ ...form, status, project_id: projectId })
        if (id !== 'new') endpoints.publish('blog', id, status)
        nav(adminUrl(`/blog/${(r as { id?: string | number }).id ?? id}`))
      },
    })
  }, [crud.save, form, id, clearDraftLocal, nav, setBaseline])

  const saveDraft = useCallback(() => submit('draft'), [submit])
  useAdminSaveHotkey(saveDraft)

  const onTitleChange = (title: string) => {
    setForm((p) => {
      const next: Data = { ...p, title }
      if (!slugLocked.current) next.slug = slugifyTitle(title)
      return next
    })
  }

  if (!pluginsReady) return <Skeleton className="h-96" />
  if (!blogOn) return <PluginOffNotice />

  const status = String(form.status || 'draft')
  const published = status === 'published'

  return (
    <div className="blog-studio -mx-4 sm:-mx-5 lg:-mx-8">
      {/* Top bar */}
      <div className="sticky top-14 z-30 border-b border-white/10 bg-[#0a0a0b]/95 backdrop-blur-md sm:top-16">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-5 lg:px-8">
          <Link
            to={adminUrl('/blog')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white"
            title="К списку"
          >
            <ArrowLeft size={16} />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-200">
              {id === 'new' ? t.newPost : t.editPost}
            </p>
            <p className="truncate text-[11px] text-zinc-500">
              {dirty ? 'Есть несохранённые изменения' : 'Всё сохранено в сессии'}
              {bannerNode ? ' · черновик в браузере' : ''}
            </p>
          </div>

          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
            published ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'
          }`}>
            {published ? t.previewPublished : t.previewDraft}
          </span>

          <div className="flex rounded-xl border border-white/10 p-0.5">
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition ${
                mode === 'write' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              onClick={() => setMode('write')}
            >
              <FilePenLine size={13} />
              {t.blogStudioWrite}
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition ${
                mode === 'preview' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              onClick={() => setMode('preview')}
            >
              <Eye size={13} />
              {t.preview}
            </button>
          </div>

          <button
            type="button"
            title={metaOpen ? 'Скрыть настройки' : 'Настройки поста'}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs transition ${
              metaOpen
                ? 'border-white/20 bg-white/10 text-white'
                : 'border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white'
            }`}
            onClick={() => setMetaOpen((v) => !v)}
          >
            {metaOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            <Settings2 size={14} />
            <span className="hidden sm:inline">{t.blogStudioMeta}</span>
          </button>

          <GhostButton type="button" disabled={crud.save.isPending} onClick={() => submit('draft')}>
            {crud.save.isPending ? t.saving : t.saveDraft}
          </GhostButton>
          <Button type="button" disabled={crud.save.isPending} onClick={() => submit('published')}>
            {t.publish}
          </Button>
        </div>
        {bannerNode ? <div className="px-4 pb-2 sm:px-5 lg:px-8">{bannerNode}</div> : null}
        {crud.save.error?.message ? (
          <p className="px-4 pb-2 text-sm text-red-400 sm:px-5 lg:px-8">{crud.save.error.message}</p>
        ) : null}
      </div>

      <div className="relative flex min-h-[calc(100vh-8rem)]">
        {/* Write canvas — stays mounted in preview mode to keep TipTap focus/state */}
        <div className={`min-w-0 flex-1 ${mode === 'preview' ? 'hidden' : ''}`}>
          <div className="mx-auto w-full max-w-[72rem] px-4 py-8 sm:px-8 sm:py-10 lg:px-12 xl:max-w-[84rem]">
            {/* Cover */}
            <div className="group relative mb-8 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent">
              {coverSrc ? (
                <img src={coverSrc} alt="" className="max-h-72 w-full object-cover" />
              ) : (
                <div className="flex h-36 items-center justify-center text-sm text-zinc-600 sm:h-44">
                  Обложка поста
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
                {form.cover_media_id != null && form.cover_media_id !== '' ? (
                  <button
                    type="button"
                    className="rounded-xl border border-white/15 bg-black/55 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur hover:text-white"
                    onClick={() => {
                      set('cover_media_id', null)
                      set('cover', null)
                    }}
                  >
                    Убрать
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-xl border border-white/15 bg-black/55 px-3 py-1.5 text-xs text-zinc-100 backdrop-blur hover:bg-black/70"
                  onClick={() => setCoverPickerOpen(true)}
                >
                  {coverSrc ? 'Сменить обложку' : 'Добавить обложку'}
                </button>
              </div>
            </div>

            {coverPickerOpen ? (
              <MediaPicker
                triggerless
                defaultOpen
                kind="image"
                label="Обложка"
                value={(form.cover_media_id as string | number | null | undefined) ?? null}
                onChange={(v, asset) => {
                  set('cover_media_id', v)
                  if (asset) set('cover', asset)
                  if (v == null) set('cover', null)
                  setCoverPickerOpen(false)
                }}
                onClose={() => setCoverPickerOpen(false)}
              />
            ) : null}

            <input
              className="blog-studio-title w-full border-0 bg-transparent font-heading text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-white outline-none placeholder:text-zinc-600 sm:text-[2.6rem]"
              placeholder="Заголовок поста"
              value={String(form.title ?? '')}
              onChange={(e) => onTitleChange(e.target.value)}
            />

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              <span className="text-zinc-600">/blog/</span>
              <input
                className="min-w-[10rem] flex-1 border-0 bg-transparent text-zinc-400 outline-none placeholder:text-zinc-700"
                placeholder="slug"
                value={String(form.slug ?? '')}
                onChange={(e) => {
                  slugLocked.current = true
                  set('slug', e.target.value)
                }}
              />
            </div>

            <div className="mt-8">
              <BlogComposer
                value={String(form.content ?? '')}
                onChange={(html) => set('content', html)}
              />
            </div>
          </div>
        </div>

        <div className={`min-w-0 flex-1 px-4 py-6 sm:px-6 ${mode === 'write' ? 'hidden' : ''}`}>
          <BlogPostPreview form={form} />
        </div>

        {/* Meta drawer */}
        {metaOpen ? (
          <aside className="blog-studio-meta sticky top-[7.25rem] hidden h-[calc(100vh-7.5rem)] w-[20rem] shrink-0 overflow-y-auto border-l border-white/10 bg-[#0e0e12] p-4 lg:block">
            <MetaFields
              form={form}
              set={set}
              projectsOn={projectsOn}
              projectOptions={projectOptions}
            />
          </aside>
        ) : null}
      </div>

      {/* Mobile meta sheet */}
      {metaOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Закрыть" onClick={() => setMetaOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-[min(22rem,92vw)] flex-col overflow-y-auto border-l border-white/10 bg-[#0e0e12] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-200">Настройки поста</p>
              <button type="button" className="text-zinc-500 hover:text-white" onClick={() => setMetaOpen(false)}>
                <PanelRightClose size={18} />
              </button>
            </div>
            <MetaFields
              form={form}
              set={set}
              projectsOn={projectsOn}
              projectOptions={projectOptions}
            />
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function MetaFields({
  form,
  set,
  projectsOn,
  projectOptions,
}: {
  form: Data
  set: (k: string, v: unknown) => void
  projectsOn: boolean
  projectOptions: Array<{ value: string; label: string }>
}) {
  const fieldClass = 'mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/25'

  return (
    <div className="space-y-5">
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Кратко</p>
        <label className="mt-2 block text-xs text-zinc-400">
          {fieldLabel('excerpt')}
          <textarea
            className={`${fieldClass} min-h-[5rem] resize-y`}
            value={String(form.excerpt ?? '')}
            onChange={(e) => set('excerpt', e.target.value)}
            placeholder="Короткое описание для списка и SEO"
          />
        </label>
        <label className="mt-3 block text-xs text-zinc-400">
          {fieldLabel('tags')}
          <input
            className={fieldClass}
            value={asText(form.tags)}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="cms, tip-tap, design"
          />
        </label>
        {projectsOn ? (
          <label className="mt-3 block text-xs text-zinc-400">
            {fieldLabel('project_id')}
            <select
              className={fieldClass}
              value={String(form.project_id ?? '')}
              onChange={(e) => set('project_id', e.target.value === '' ? null : e.target.value)}
            >
              {projectOptions.map((o) => (
                <option key={o.value || 'none'} value={o.value} className="bg-[#12141c]">
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">SEO</p>
        <label className="mt-2 block text-xs text-zinc-400">
          {fieldLabel('seo_title')}
          <input
            className={fieldClass}
            value={String(form.seo_title ?? '')}
            onChange={(e) => set('seo_title', e.target.value)}
            placeholder="Если пусто — заголовок поста"
          />
        </label>
        <label className="mt-3 block text-xs text-zinc-400">
          {fieldLabel('seo_description')}
          <textarea
            className={`${fieldClass} min-h-[5rem] resize-y`}
            value={String(form.seo_description ?? '')}
            onChange={(e) => set('seo_description', e.target.value)}
          />
        </label>
      </section>

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">OG / шаринг</p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
          Картинка для соцсетей и превью ссылки (Open Graph). На странице поста не показывается — там обложка сверху на холсте.
        </p>
        <div className="mt-2">
          <MediaPicker
            kind="image"
            label="OG-обложка"
            value={(form.og_image_id as string | number | null | undefined) ?? null}
            onChange={(v, asset) => {
              set('og_image_id', v)
              if (asset) set('og_image', asset)
              if (v == null) set('og_image', null)
            }}
          />
        </div>
      </section>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Обложка на холсте — в посте. OG здесь — для Telegram/VK/и т.п. «/» в пустом абзаце — блоки.
      </p>
    </div>
  )
}
