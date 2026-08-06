import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Eye, EyeOff, Home, LayoutTemplate, Paintbrush, Plus, Trash2, Wand2 } from 'lucide-react'
import { useAdminList, useCrud } from '@/hooks/useApi'
import { api } from '@/lib/api'
import type { ID, Page } from '@/types'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { emptyLayout } from '@/builder/types'
import { SLUG_PLUGIN_GATES, siteHasPlugin } from '@/core/pluginGates'
import { t } from '@/admin/i18n'
import { useAuth } from '@/context/AuthContext'
import { useSite } from '@/hooks/useApi'
import { adminUrl } from '@/admin/adminBasePath'

/** Core system slugs (not owned by an optional plugin). */
const CORE_SYSTEM_SLUGS = new Set([
  'privacy', 'terms', 'not-found', 'admin-login', 'lazy-loader', 'maintenance',
])

type TemplateRow = {
  slug: string
  title: string
  group: string
  route: string
  description: string
  plugin?: string | null
  page_id: number | null
  status: string | null
  has_layout: boolean
  is_seed?: boolean
  use_on_site?: boolean
  exists: boolean
}

export function PagesListPage() {
  const { isDemo } = useAuth()
  const { data: site } = useSite()
  const enabledPlugins = site?.enabled_plugins
  const { data = [], isLoading } = useAdminList<Page>('pages')
  const { remove, save } = useCrud('pages')
  const nav = useNavigate()
  const client = useQueryClient()
  const [filter, setFilter] = useState('')
  const [copyTarget, setCopyTarget] = useState<Page | null>(null)
  const [copySourceId, setCopySourceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const templatesQuery = useQuery({
    queryKey: ['admin', 'page-templates', enabledPlugins],
    queryFn: async () => {
      const res = await api.get<{ data: TemplateRow[] }>('/admin/page-templates', { silent: true })
      return (res as { data?: TemplateRow[] })?.data ?? []
    },
  })

  /** Hide plugin-owned system pages when their plugin is off (even if row exists in DB). */
  const pageVisible = (slug: string) => {
    if (slug.startsWith('product-detail')) return siteHasPlugin(enabledPlugins, 'products')
    const gate = SLUG_PLUGIN_GATES[slug]
    if (!gate) return true
    return siteHasPlugin(enabledPlugins, gate)
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const systemSlugs = new Set([
      ...CORE_SYSTEM_SLUGS,
      ...Object.keys(SLUG_PLUGIN_GATES),
      ...(templatesQuery.data ?? []).map((t) => t.slug),
    ])
    const custom = data.filter((p) => !systemSlugs.has(p.slug) && !p.is_home && pageVisible(p.slug))
    const home = data.filter((p) => p.is_home)
    const list = [...home, ...custom]
    if (!q) return list
    return list.filter((p) => `${p.title} ${p.slug}`.toLowerCase().includes(q))
  }, [data, filter, templatesQuery.data, enabledPlugins])

  const createPage = async () => {
    try {
      const created = await save.mutateAsync({
        data: {
          title: 'Новая страница',
          slug: `page-${Date.now()}`,
          status: 'draft',
          layout: emptyLayout(),
          is_home: 0,
        },
      })
      const id = (created as Page)?.id
      if (id != null) nav(adminUrl(`/pages/${id}/builder`))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось создать')
    }
  }

  const ensureTemplates = async () => {
    if (isDemo) {
      setMsg('В Demo Sandbox шаблоны production недоступны — работайте с Demo Home / Demo About.')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const res = await api.post<{ data: { created: number; filled: number; skipped: number } }>(
        '/admin/page-templates/ensure',
        {},
      )
      const d = (res as { data?: { created: number; filled: number; skipped: number } })?.data
      const marked = (d as { marked_seed?: number })?.marked_seed
      setMsg(
        `Шаблоны: создано ${d?.created ?? 0}, заполнено пустых ${d?.filled ?? 0}, пропущено ${d?.skipped ?? 0}`
        + (marked != null ? `, заготовок помечено seed: ${marked}` : '')
        + '. Заготовка на сайте не показывается — там классические страницы с данными CMS. Нажмите «Билдер», чтобы увидеть виджеты.'
      )
      void client.invalidateQueries({ queryKey: ['admin', 'page-templates'] })
      void client.invalidateQueries({ queryKey: ['admin', 'pages'] })
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const copyLayout = async () => {
    if (!copyTarget || !copySourceId) return
    setBusy(true)
    try {
      const res = await api.post<{ data?: { message?: string } }>(
        `/admin/pages/${copyTarget.id}/copy-layout`,
        { source_id: Number(copySourceId) },
      )
      setMsg((res as { data?: { message?: string } })?.data?.message || 'Стиль скопирован')
      setCopyTarget(null)
      setCopySourceId('')
      void client.invalidateQueries({ queryKey: ['admin', 'pages'] })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось скопировать')
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async (page: Page) => {
    try {
      const created = await save.mutateAsync({
        data: {
          title: `${page.title} (копия)`,
          slug: `${page.slug}-copy`,
          status: 'draft',
          layout: page.layout ?? emptyLayout(),
          content: page.content,
          seo_title: page.seo_title,
          seo_description: page.seo_description,
          is_home: 0,
        },
      })
      const id = (created as Page)?.id
      if (id != null) nav(`/admin/pages/${id}/builder`)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось дублировать')
    }
  }

  const setHome = async (page: Page) => {
    if (page.is_home) return
    if (!confirm(`Сделать «${page.title}» главной страницей сайта?`)) return
    try {
      await save.mutateAsync({ id: page.id, data: { is_home: 1 } })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось назначить главную')
    }
  }

  const toggleStatus = async (page: Page) => {
    const next = page.status === 'published' ? 'draft' : 'published'
    try {
      await save.mutateAsync({ id: page.id, data: { status: next } })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось сменить статус')
    }
  }

  const templates = templatesQuery.data ?? []
  const groups = useMemo(() => {
    const map = new Map<string, TemplateRow[]>()
    for (const t of templates) {
      const list = map.get(t.group) ?? []
      list.push(t)
      map.set(t.group, list)
    }
    return [...map.entries()]
  }, [templates])

  return (
    <div>
      <AdminPageHero
        title="Страницы и шаблоны"
        eyebrow="Контент"
        accent="sky"
        actions={
          <>
            {!isDemo ? (
              <Button type="button" disabled={busy} onClick={() => void ensureTemplates()}>
                <Wand2 size={16} /> Создать / обновить шаблоны
              </Button>
            ) : null}
            <Button type="button" onClick={() => void createPage()}>
              <Plus size={16} /> Новая страница
            </Button>
          </>
        }
      >
        <p className="max-w-3xl text-sm text-zinc-500">
          <b className="font-medium text-zinc-300">{t.pagesSeed}</b> — заготовка в билдере с виджетами (превью).
          Пока seed, на сайте остаётся классическая страница с живыми данными.
          После первого «Сохранить» в билдере шаблон становится основной страницей на сайте.
          Шаблоны плагинов видны только когда плагин включён — каждый плагин управляет своими страницами.
        </p>
      </AdminPageHero>

      {msg && <p className="mb-4 text-sm text-zinc-400">{msg}</p>}

      <section className="mb-10">
        <h2 className="mb-3 font-heading text-xl">Системные шаблоны</h2>
        {templatesQuery.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="space-y-6">
            {groups.map(([group, rows]) => (
              <div key={group}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{group}</p>
                <GlassPanel className="divide-y divide-white/10 overflow-hidden">
                  {rows.map((row) => (
                    <div key={row.slug} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <b>{row.title}</b>
                          <code className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-400">{row.route}</code>
                          {row.has_layout ? (
                            row.use_on_site && !row.is_seed ? (
                              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] uppercase text-sky-300">на сайте</span>
                            ) : row.is_seed ? (
                              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] uppercase text-violet-300">seed · превью</span>
                            ) : (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase text-emerald-300">{t.pagesLayout}</span>
                            )
                          ) : (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase text-amber-200">пусто</span>
                          )}
                          {row.plugin ? (
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-zinc-400">{row.plugin}</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-sm text-zinc-500">{row.description}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {row.exists && row.page_id != null ? (
                          <>
                            <Button
                              type="button"
                              className="px-2"
                              title="Копировать стиль с другой страницы"
                              onClick={() => {
                                const page = data.find((p) => Number(p.id) === row.page_id) ?? {
                                  id: row.page_id,
                                  title: row.title,
                                  slug: row.slug,
                                } as Page
                                setCopyTarget(page)
                              }}
                            >
                              <Paintbrush size={15} />
                            </Button>
                            <Link
                              to={`/admin/pages/${row.page_id}/builder`}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-sm hover:bg-white/5"
                            >
                              <LayoutTemplate size={14} /> Билдер
                            </Link>
                          </>
                        ) : (
                          <Button type="button" disabled={busy} onClick={() => void ensureTemplates()}>
                            Создать
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </GlassPanel>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-heading text-xl">Страницы сайта</h2>
        <input
          className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          placeholder={t.filterList}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <GlassPanel className="overflow-hidden">
          {isLoading ? <Skeleton className="h-64" /> : !filtered.length ? (
            <p className="p-10 text-center text-zinc-500">{t.noItems}</p>
          ) : (
            <div className="divide-y divide-white/10">
              {filtered.map((page) => {
                const href = page.is_home ? '/' : `/${page.slug}`
                const published = page.status === 'published'
                return (
                  <div key={String(page.id)} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{page.title}</b>
                        {page.is_home ? (
                          <span className="rounded-full bg-[var(--accent,#8eb6ff)]/15 px-2 py-0.5 text-[10px] uppercase text-[var(--accent,#8eb6ff)]">{t.pagesHome}</span>
                        ) : null}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${published ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'}`}>
                          {published ? t.statusPublished : t.statusDraft}
                        </span>
                      </div>
                      <p className="truncate text-sm text-zinc-500">/{page.is_home ? '' : page.slug}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        title={published ? 'Открыть на сайте' : 'Превью черновика (только для админа)'}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white"
                      >
                        <ExternalLink size={15} />
                      </a>
                      <Button type="button" className="px-2" title="Копировать стиль сюда" onClick={() => setCopyTarget(page)}>
                        <Paintbrush size={15} />
                      </Button>
                      <Button type="button" className="px-2" title={page.is_home ? t.pagesAlreadyHome : t.pagesMakeHome} disabled={Boolean(page.is_home) || save.isPending} onClick={() => void setHome(page)}>
                        <Home size={15} className={page.is_home ? 'text-[var(--accent,#8eb6ff)]' : undefined} />
                      </Button>
                      <Button type="button" className="px-2" title={published ? 'Снять с публикации' : 'Опубликовать'} disabled={save.isPending} onClick={() => void toggleStatus(page)}>
                        {published ? <EyeOff size={15} /> : <Eye size={15} />}
                      </Button>
                      <Link to={`/admin/pages/${page.id}/builder`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-sm hover:bg-white/5">
                        <LayoutTemplate size={14} /> Билдер
                      </Link>
                      <Button type="button" className="px-2" title={t.duplicate} onClick={() => void duplicate(page)}>
                        <Copy size={15} />
                      </Button>
                      <Button type="button" className="px-2 text-red-300" onClick={() => { if (confirm(t.deleteConfirm)) remove.mutate(page.id as ID) }}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </GlassPanel>
      </section>

      {copyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setCopyTarget(null)}>
          <GlassPanel className="w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-xl">Копировать стиль</h3>
            <p className="text-sm text-zinc-400">
              Layout (структура и стили виджетов) с выбранной страницы будет записан в «{copyTarget.title}».
              Заголовок и URL цели не меняются.
            </p>
            <label className="block space-y-1 text-sm">
              <span className="text-zinc-400">Откуда копировать</span>
              <select
                className="w-full rounded-lg border border-white/10 bg-[#10141c] px-3 py-2"
                value={copySourceId}
                onChange={(e) => setCopySourceId(e.target.value)}
              >
                <option value="">— выберите страницу —</option>
                {data
                  .filter((p) => String(p.id) !== String(copyTarget.id))
                  .map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {p.title} (/{p.is_home ? '' : p.slug})
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setCopyTarget(null)}>Отмена</Button>
              <Button type="button" className="admin-primary" disabled={!copySourceId || busy} onClick={() => void copyLayout()}>
                Скопировать
              </Button>
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  )
}
