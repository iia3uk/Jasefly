import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDown, ArrowLeft, ArrowUp, Boxes, ChevronDown, ChevronRight, ClipboardPaste,
  Copy, Eye, EyeOff, GripVertical, Home, Layers, Monitor, MoreHorizontal, PanelRight,
  Plus, Redo2, RotateCcw, Settings2, Smartphone, Tablet, Trash2, ExternalLink, Save, Undo2, X,
} from 'lucide-react'
import { useAdminItem, useCrud, useProfile, useSite } from '@/hooks/useApi'
import type { BuilderElementDTO, Page, PageLayout } from '@/types'
import { Skeleton } from '@/components/ui'
import { LayoutRenderer } from '@/builder/render/LayoutRenderer'
import { listWidgets } from '@/builder/registry'
import { initBuilderWidgets } from '@/builder/widgets'
import { emptyLayout, type DeviceMode, type PanelTab, type SettingsField } from '@/builder/types'
import {
  canAcceptChild,
  findElement,
  findElementPath,
  findParent,
  reduceLayout,
  ensureColumnForDrop,
  isBuilderHidden,
  pasteNode,
} from '@/builder/tree'
import { defaultLayoutForPage, isShellLayout, isSparseSeedLayout } from '@/builder/migrateHome'
import { readStyles, readFieldStyles, StyleFields } from '@/builder/edit/StyleFields'
import { ColorControl } from '@/builder/edit/ColorControl'
import { PRODUCT_BIND_OPTIONS } from '@/builder/bind/resolveBound'
import { ProductEntityProvider } from '@/builder/context/ProductEntityContext'
import { resolveEditorSettings, bakeLayoutContent, layoutContentChanged } from '@/builder/editor/resolveEditorSettings'
import { pullCmsIntoLayout, pushLayoutToCms, layoutHeroShouldHealCms } from '@/builder/editor/cmsSync'
import { readBuilderClipboard, writeBuilderClipboard } from '@/builder/editor/clipboard'
import { BuilderContextMenu, type BuilderContextMenuState } from '@/builder/editor/BuilderContextMenu'
import { MediaPicker } from '@/admin/components/MediaPicker'
import { RichTextEditor } from '@/admin/components/RichTextEditor'
import { useAdminSaveHotkey, useUnsavedGuard } from '@/admin/hooks/useAdminFormGuards'
import { RevisionsPanel } from '@/admin/components/RevisionsPanel'
import { themeStyleVars } from '@/shared/themeStyleVars'
import { getTemplateCss } from '@/shared/siteTemplates'
import { adminUrl } from '@/admin/adminBasePath'
import { SectionColsPreview, widgetIcon, widgetIconTone } from '@/builder/lib/widgetIcons'
import clsx from 'clsx'

initBuilderWidgets()

const PALETTE_ORDER = ['basic', 'landing', 'portfolio', 'commerce', 'system', 'mail', 'integration'] as const
const PALETTE_LABELS: Record<string, string> = {
  basic: 'Базовые',
  landing: 'Лендинг',
  portfolio: 'Портфолио',
  commerce: 'Коммерция',
  system: 'Аккаунт',
  mail: 'Почта',
  integration: 'Интеграции',
}

const deviceWidth: Record<DeviceMode, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
}

type LeftTab = PanelTab | 'page' | 'revisions'

const PART_LABELS: Record<string, string> = {
  badge_text: 'Бейдж',
  headline: 'Заголовок',
  subheadline: 'Подзаголовок',
  primary_cta_label: 'Кнопка 1',
  primary_cta_href: 'Ссылка кнопки 1',
  secondary_cta_label: 'Кнопка 2',
  secondary_cta_href: 'Ссылка кнопки 2',
  cta_label: 'Кнопка',
  cta_href: 'Ссылка',
  title: 'Заголовок',
  subtitle: 'Подзаголовок',
  text: 'Текст',
  html: 'Текст',
  label: 'Кнопка',
  href: 'Ссылка',
  connector: 'Линия',
  media_id: 'Медиа',
  background_media_id: 'Фон',
}

function elementLabel(el: BuilderElementDTO) {
  if (el.elType === 'section') return 'Секция'
  if (el.elType === 'column') return 'Колонка'
  return listWidgets().find((w) => w.type === el.widgetType)?.label ?? el.widgetType ?? 'Виджет'
}

export function PageBuilderPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data, isLoading } = useAdminItem<Page>('pages', id)
  const crud = useCrud('pages')
  const [layout, setLayout] = useState<PageLayout>(emptyLayout())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPart, setSelectedPart] = useState<string | null>(null)
  const [tab, setTab] = useState<LeftTab>('widgets')
  const [device, setDevice] = useState<DeviceMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches ? 'mobile' : 'desktop',
  )
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [ogImageId, setOgImageId] = useState<string | number | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [isHome, setIsHome] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [hydratedFor, setHydratedFor] = useState<string | null>(null)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [ctxMenu, setCtxMenu] = useState<BuilderContextMenuState | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)
  const pastRef = useRef<PageLayout[]>([])
  const futureRef = useRef<PageLayout[]>([])
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const pulledCmsFor = useRef<string | null>(null)
  const canvasScrollRef = useRef<HTMLElement | null>(null)
  /** Mobile: which bottom-sheet is open. Desktop ignores this. */
  const [mobileSheet, setMobileSheet] = useState<null | 'nav' | 'props' | 'more'>(null)
  const { data: site } = useSite()
  const { data: profile } = useProfile()
  useUnsavedGuard(dirty)

  useEffect(() => {
    setHydratedFor(null)
    pulledCmsFor.current = null
    pastRef.current = []
    futureRef.current = []
    setHistoryTick((n) => n + 1)
  }, [id])

  // Admin → Builder: merge hero/sections from CMS when home opens (never overwrite real layout with stubs).
  useEffect(() => {
    if (!isHome || !site || !hydratedFor) return
    const heroKey = [
      site.hero?.headline,
      site.hero?.subheadline,
      site.hero?.background_media_id ?? site.hero?.background?.id,
      site.homepage_sections?.map((s) => `${s.section_key}:${s.title}`).join('|'),
    ].join('||')
    const pullKey = `${hydratedFor}::${heroKey}`
    if (pulledCmsFor.current === pullKey) return
    pulledCmsFor.current = pullKey
    setLayout((prev) => {
      const merged = pullCmsIntoLayout(prev, site)
      // Heal stubbed Admin Hero from real layout copy (one-shot per open).
      if (layoutHeroShouldHealCms(merged, site)) {
        void pushLayoutToCms(merged, site)
          .then(() => {
            void qc.invalidateQueries({ queryKey: ['site'] })
            void qc.invalidateQueries({ queryKey: ['admin-singleton', 'hero'] })
          })
          .catch(() => { /* non-fatal */ })
      }
      return merged
    })
  }, [isHome, site, hydratedFor, site?.hero, site?.homepage_sections, qc])

  useEffect(() => {
    if (!data?.id) return
    const key = String(data.id)
    if (hydratedFor === key) return
    setTitle(data.title || '')
    setSlug(data.slug || '')
    setSeoTitle(data.seo_title || '')
    setSeoDescription(data.seo_description || '')
    setOgImageId(data.og_image_id ?? null)
    setScheduledAt(data.scheduled_at ? String(data.scheduled_at).slice(0, 16).replace(' ', 'T') : '')
    setIsHome(Boolean(data.is_home))
    const incoming = data.layout ?? (typeof data.layout_json === 'string' && data.layout_json
      ? JSON.parse(data.layout_json) as PageLayout
      : null)
    if (incoming?.elements?.length && !isShellLayout(incoming) && !isSparseSeedLayout(incoming)) {
      setLayout(incoming)
      setDirty(false)
    } else {
      const rich = defaultLayoutForPage({ isHome: Boolean(data.is_home), slug: data.slug })
      if (rich) {
        setLayout(rich)
        setDirty(true)
      } else if (incoming?.elements?.length) {
        setLayout(incoming)
        setDirty(false)
      } else {
        setLayout(emptyLayout())
        setDirty(false)
      }
    }
    pastRef.current = []
    futureRef.current = []
    setHistoryTick((n) => n + 1)
    setHydratedFor(key)
  }, [data, hydratedFor])

  // Fill empty hero/about fields from CMS once — only writes into blank keys, never overwrites edits.
  useEffect(() => {
    if (!data?.id || !site || hydratedFor !== String(data.id)) return
    setLayout((prev) => {
      const baked = bakeLayoutContent(prev, { site, profile: profile ?? null })
      if (!layoutContentChanged(prev, baked)) return prev
      setDirty(true)
      return baked
    })
  }, [data?.id, site, profile, hydratedFor])

  const selected = useMemo(() => findElement(layout, selectedId), [layout, selectedId])
  const selectionPath = useMemo(() => findElementPath(layout, selectedId), [layout, selectedId])
  const palettes = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase()
    return PALETTE_ORDER
      .map((key) => {
        const items = listWidgets(key).filter((w) => {
          if (!q) return true
          return w.label.toLowerCase().includes(q) || w.type.toLowerCase().includes(q)
        })
        return { key, title: PALETTE_LABELS[key] ?? key, items }
      })
      .filter((p) => p.items.length > 0)
  }, [paletteQuery])

  const apply = useCallback((next: PageLayout, opts?: { skipHistory?: boolean }) => {
    // Keep layout as source of truth: fill any still-empty widget fields from defaults/CMS seeds.
    const baked = bakeLayoutContent(next, { site: site ?? null, profile: profile ?? null })
    if (!opts?.skipHistory) {
      pastRef.current = [...pastRef.current.slice(-49), layoutRef.current]
      futureRef.current = []
    }
    setLayout(baked)
    setDirty(true)
    setHistoryTick((n) => n + 1)
  }, [site, profile])

  const undo = useCallback(() => {
    const prev = pastRef.current.pop()
    if (!prev) return
    futureRef.current.push(layoutRef.current)
    setLayout(prev)
    setDirty(true)
    setHistoryTick((n) => n + 1)
  }, [])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (!next) return
    pastRef.current.push(layoutRef.current)
    setLayout(next)
    setDirty(true)
    setHistoryTick((n) => n + 1)
  }, [])

  const canUndo = historyTick >= 0 && pastRef.current.length > 0
  const canRedo = historyTick >= 0 && futureRef.current.length > 0

  const markDirty = () => setDirty(true)

  const save = useCallback((status?: string) => {
    if (!id || id === 'new') return
    const cleanSlug = slug.trim().replace(/^\/+/, '').replace(/\s+/g, '-') || `page-${id}`
    // Bake CMS leftovers into settings, then mark layout as live on the public site.
    const baked = bakeLayoutContent(layout, { site: site ?? null, profile: profile ?? null })
    const layoutToSave: PageLayout = {
      ...baked,
      meta: {
        ...(baked.meta ?? {}),
        seed: false,
        useOnSite: true,
      },
    }
    const nextStatus = status ?? data?.status ?? 'draft'
    crud.save.mutate({
      data: {
        title: title.trim() || 'Без названия',
        // Главная всегда __home — обычный slugify ломал сохранение.
        slug: isHome ? '__home' : cleanSlug,
        seo_title: seoTitle.trim() || null,
        seo_description: seoDescription.trim() || null,
        og_image_id: ogImageId || null,
        scheduled_at: nextStatus === 'published'
          ? null
          : (scheduledAt.trim()
            ? scheduledAt.trim().replace('T', ' ') + (scheduledAt.length === 16 ? ':00' : '')
            : null),
        layout: layoutToSave,
        status: nextStatus,
        is_home: isHome ? 1 : 0,
      },
      id,
    }, {
      onSuccess: () => {
        setLayout(layoutToSave)
        setDirty(false)
        void qc.invalidateQueries({ queryKey: ['admin', 'pages', id, 'revisions'] })
        // Builder → Admin: mirror hero + homepage section titles into CMS.
        if (isHome) {
          void pushLayoutToCms(layoutToSave, site)
            .then(() => {
              void qc.invalidateQueries({ queryKey: ['site'] })
              void qc.invalidateQueries({ queryKey: ['admin-singleton', 'hero'] })
              void qc.invalidateQueries({ queryKey: ['admin', 'homepage-sections'] })
            })
            .catch(() => {
              /* non-fatal — page layout already saved */
            })
        }
      },
      onError: () => {
        // Детали уже открываются в ApiErrorDebugger (правый нижний угол).
      },
    })
  }, [id, title, slug, seoTitle, seoDescription, ogImageId, scheduledAt, layout, data, crud.save, isHome, site, profile, qc])

  useAdminSaveHotkey(() => save())

  const selectElement = useCallback((id: string | null, opts?: { scroll?: boolean; part?: string | null }) => {
    setSelectedId(id)
    setSelectedPart(opts?.part !== undefined ? opts.part : null)
    if (id) {
      setTab('structure')
      // Phone: jump straight into the props sheet for the selected object.
      setMobileSheet('props')
    }
    if (!id || opts?.scroll === false) return
    requestAnimationFrame(() => {
      const root = canvasScrollRef.current
      const target = root?.querySelector<HTMLElement>(`[data-builder-id="${CSS.escape(id)}"]`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    })
  }, [])

  const duplicateSelected = useCallback((elId: string) => {
    const next = reduceLayout(layoutRef.current, { type: 'duplicate', id: elId })
    apply(next)
    const path = findParent(next.elements, elId)
    const clone = path?.list[path.index + 1]
    if (clone) selectElement(clone.id)
  }, [apply, selectElement])

  const copySelected = useCallback((elId: string) => {
    const el = findElement(layoutRef.current, elId)
    if (el) writeBuilderClipboard(el)
  }, [])

  const pasteClipboard = useCallback(() => {
    const clip = readBuilderClipboard()
    if (!clip) return
    const result = pasteNode(layoutRef.current, clip, selectedId)
    if (!result) return
    apply(result.layout)
    selectElement(result.newId)
  }, [apply, selectElement, selectedId])

  const removeSelected = useCallback((elId: string) => {
    apply(reduceLayout(layoutRef.current, { type: 'remove', id: elId }))
    if (selectedId === elId) {
      setSelectedId(null)
      setSelectedPart(null)
    }
  }, [apply, selectedId])

  const moveToParent = useCallback((elId: string, targetParentId: string, index: number) => {
    apply(reduceLayout(layoutRef.current, { type: 'move', id: elId, targetParentId, index }))
  }, [apply])

  const moveSibling = useCallback((elId: string, dir: -1 | 1) => {
    const hit = findParent(layoutRef.current.elements, elId)
    if (!hit) return
    const nextIndex = hit.index + dir
    if (nextIndex < 0 || nextIndex >= hit.list.length) return
    apply(reduceLayout(layoutRef.current, { type: 'reorder', id: elId, toIndex: nextIndex }))
  }, [apply])

  const reorderTo = useCallback((elId: string, toIndex: number) => {
    apply(reduceLayout(layoutRef.current, { type: 'reorder', id: elId, toIndex }))
  }, [apply])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setHelpOpen((v) => !v)
        return
      }
      if (e.key === 'Escape') {
        setCtxMenu(null)
        setHelpOpen(false)
        setMobileSheet(null)
        if (selectedPart) setSelectedPart(null)
        else setSelectedId(null)
        return
      }
      if (mod && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (mod && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.code === 'KeyD' && selectedId) {
        e.preventDefault()
        duplicateSelected(selectedId)
        return
      }
      if (mod && e.code === 'KeyC' && selectedId) {
        e.preventDefault()
        copySelected(selectedId)
        return
      }
      if (mod && e.code === 'KeyV') {
        e.preventDefault()
        pasteClipboard()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        removeSelected(selectedId)
        return
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && selectedId) {
        e.preventDefault()
        moveSibling(selectedId, e.key === 'ArrowUp' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, selectedPart, undo, redo, duplicateSelected, copySelected, pasteClipboard, removeSelected, moveSibling])

  const addWidgetToCanvas = (widgetType: string, parentId?: string) => {
    if (parentId) {
      apply(reduceLayout(layout, { type: 'addWidget', parentId, widgetType }))
      return
    }
    const ensured = ensureColumnForDrop(layout)
    const next = reduceLayout(ensured.layout, { type: 'addWidget', parentId: ensured.columnId, widgetType })
    apply(next)
  }

  const toggleHidden = (elId: string) => {
    const el = findElement(layout, elId)
    if (!el) return
    apply(reduceLayout(layout, {
      type: 'updateSettings',
      id: elId,
      settings: { hidden: !isBuilderHidden(el) },
    }))
  }

  const insertAtSlot = (
    kind: 'section' | 'column' | 'widget',
    parentId: string | null,
    index: number,
    widgetType?: string,
  ) => {
    if (kind === 'section') {
      apply(reduceLayout(layout, { type: 'addSection', columns: 1, index }))
      return
    }
    if (!parentId) return
    if (kind === 'column') {
      apply(reduceLayout(layout, { type: 'addColumn', parentId, index }))
      return
    }
    if (widgetType) {
      apply(reduceLayout(layout, { type: 'addWidget', parentId, widgetType, index }))
    }
  }

  const resetHomeLayout = () => {
    const rich = defaultLayoutForPage({ isHome, slug })
    if (!rich) return
    if (!confirm('Заменить текущий layout шаблоном по умолчанию? Несохранённые правки пропадут.')) return
    apply(rich)
  }

  const publicPath = isHome ? '/' : slug ? `/${slug}` : null
  const published = data?.status === 'published'
  const scheduleDate = scheduledAt
    ? new Date(scheduledAt.includes('T') ? scheduledAt : scheduledAt.replace(' ', 'T'))
    : null
  const scheduleFuture = scheduleDate && !Number.isNaN(scheduleDate.getTime()) && scheduleDate.getTime() > Date.now()
  const statusLabel = published
    ? 'Опубликовано'
    : scheduleFuture
      ? `Запланировано · ${scheduleDate.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
      : 'Черновик'
  const statusTone = published
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : scheduleFuture
      ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-200'

  const canvasThemeStyle = useMemo(() => themeStyleVars(site?.theme), [site?.theme])
  const canvasPresetCss = useMemo(() => getTemplateCss(site?.theme?.preset), [site?.theme?.preset])
  const canvasCustomCss = site?.theme?.custom_css?.trim() ?? ''

  if (isLoading) return <div className="flex min-h-dvh items-center justify-center bg-[#0a0a0b] text-zinc-100"><Skeleton className="h-40 w-80" /></div>
  if (!data) return <div className="p-10 text-zinc-400">Страница не найдена</div>

  const leftPanelBody = (
    <>
      <div className="flex border-b border-white/[0.07]">
        {([
          ['widgets', 'Виджеты'],
          ['structure', 'Структура'],
          ['page', 'Страница'],
          ['revisions', 'Ревизии'],
        ] as const).map(([tabId, label]) => (
          <button
            key={tabId}
            type="button"
            className={clsx(
              'relative flex-1 py-3 text-[10px] font-semibold uppercase tracking-wider transition-colors lg:py-2.5',
              tab === tabId ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
            )}
            onClick={() => setTab(tabId)}
          >
            {label}
            {tab === tabId && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent,#8eb6ff)] shadow-[0_0_12px_var(--accent,#8eb6ff)]" />
            )}
          </button>
        ))}
      </div>
      <div className="admin-quiet-scroll flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {tab === 'widgets' ? (
          <div className="space-y-4">
            <div className="builder-palette-search">
              <input
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[var(--accent,#8eb6ff)]/40 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent,#8eb6ff)_18%,transparent)]"
                placeholder="Поиск виджетов…"
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
              />
            </div>
            <div>
              <p className="builder-palette-label mb-2">Секции</p>
              <div className="grid grid-cols-5 gap-2">
                {([1, 2, 3, 4, 6] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="builder-palette-tile builder-palette-tile--section"
                    title={`Секция · ${n} ${n === 1 ? 'колонка' : n < 5 ? 'колонки' : 'колонок'}`}
                    onClick={() => {
                      apply(reduceLayout(layout, { type: 'addSection', columns: n }))
                      setMobileSheet(null)
                    }}
                  >
                    <SectionColsPreview cols={n} />
                    <span className="builder-palette-tile__label">{n}</span>
                  </button>
                ))}
              </div>
            </div>
            {palettes.map((p) => (
              <WidgetPalette
                key={p.key}
                title={p.title}
                items={p.items}
                onAdd={(type) => {
                  addWidgetToCanvas(type)
                  setMobileSheet(null)
                }}
              />
            ))}
            {!palettes.length && paletteQuery.trim() ? (
              <p className="text-sm text-zinc-500">Ничего не найдено</p>
            ) : null}
            <p className="text-[11px] leading-4 text-zinc-600">
              Тап — добавить · drag на колонку · ПКМ по блоку · ? — шорткаты
            </p>
          </div>
        ) : tab === 'structure' ? (
          <StructureTree
            layout={layout}
            selectedId={selectedId}
            selectedPart={selectedPart}
            onSelect={(id) => {
              selectElement(id)
              setMobileSheet('props')
            }}
            onSelectPart={(id, part) => {
              selectElement(id, { part })
              setMobileSheet('props')
            }}
            onRemove={removeSelected}
            onMove={moveSibling}
            onReorder={reorderTo}
            onMoveTo={moveToParent}
            onToggleHidden={toggleHidden}
            onInsert={insertAtSlot}
            onContextMenu={(id, x, y) => {
              selectElement(id, { scroll: false })
              setCtxMenu({ id, x, y })
            }}
          />
        ) : tab === 'revisions' ? (
          <RevisionsPanel pageId={id} onRestored={() => { setHydratedFor(null); setDirty(true) }} />
        ) : (
          <PageSettings
            slug={slug}
            seoTitle={seoTitle}
            seoDescription={seoDescription}
            ogImageId={ogImageId}
            scheduledAt={scheduledAt}
            isHome={isHome}
            siteName={site?.site_settings?.site_name || 'Сайт'}
            layout={layout}
            onSlug={(v) => { setSlug(v); markDirty() }}
            onSeoTitle={(v) => { setSeoTitle(v); markDirty() }}
            onSeoDescription={(v) => { setSeoDescription(v); markDirty() }}
            onOgImageId={(v) => { setOgImageId(v); markDirty() }}
            onScheduledAt={(v) => { setScheduledAt(v); markDirty() }}
            onIsHome={(v) => { setIsHome(v); markDirty() }}
            onLayoutMeta={(patch) => {
              apply({
                ...layout,
                meta: { ...(layout.meta ?? {}), ...patch },
              })
            }}
            onEnableSnapPages={() => {
              const nextElements = (layout.elements ?? []).map((el) => {
                if (el.elType !== 'section') return el
                return {
                  ...el,
                  settings: {
                    ...(el.settings ?? {}),
                    min_height: el.settings?.min_height || '100dvh',
                    paddingY: el.settings?.paddingY ?? '0',
                    v_align: el.settings?.v_align || 'center',
                    animation: el.settings?.animation && el.settings.animation !== 'none'
                      ? el.settings.animation
                      : 'fade-up',
                    scroll_snap: el.settings?.scroll_snap || 'auto',
                    snap_stop: el.settings?.snap_stop || 'always',
                  },
                }
              })
              apply({
                ...layout,
                elements: nextElements,
                meta: {
                  ...(layout.meta ?? {}),
                  scroll_snap: 'mandatory',
                  scroll_smooth: true,
                  snap_height: '100dvh',
                },
              })
            }}
          />
        )}
      </div>
    </>
  )

  const propsPanelBody = !selected ? (
    <div className="space-y-4 text-sm text-zinc-500">
      <p>Тапни блок на холсте — здесь откроются его поля и стили.</p>
      <button
        type="button"
        className="builder-tool min-h-11 w-full"
        onClick={() => {
          setTab('page')
          setMobileSheet('nav')
        }}
      >
        <Settings2 size={16} /> Настройки страницы
      </button>
    </div>
  ) : (
    <ElementSettings
      element={selected}
      selectedPart={selectedPart}
      onChange={(settings) => apply(reduceLayout(layout, { type: 'updateSettings', id: selected.id, settings }))}
      onClearPart={() => setSelectedPart(null)}
      onRemove={() => {
        apply(reduceLayout(layout, { type: 'remove', id: selected.id }))
        setSelectedId(null)
        setSelectedPart(null)
        setMobileSheet(null)
      }}
    />
  )

  const canvas = (
    <div
      className="admin-preview-surface mx-auto w-full rounded-none border-0 shadow-none transition-[max-width] lg:rounded-xl lg:border lg:border-white/[0.06] lg:shadow-2xl"
      style={{ maxWidth: deviceWidth[device], ...canvasThemeStyle }}
      onContextMenu={(e) => {
        const target = (e.target as HTMLElement).closest('[data-builder-id]') as HTMLElement | null
        const elId = target?.getAttribute('data-builder-id') || selectedId
        if (!elId) return
        e.preventDefault()
        selectElement(elId, { scroll: false })
        setCtxMenu({ id: elId, x: e.clientX, y: e.clientY })
      }}
    >
      {(canvasPresetCss || canvasCustomCss) ? (
        <style>{[canvasPresetCss, canvasCustomCss].filter(Boolean).join('\n')}</style>
      ) : null}
      {slug === 'product-card' || slug.startsWith('product-detail') ? (
        <ProductEntityProvider useDemoFallback>
          <LayoutRenderer
            layout={layout}
            editMode
            selectedId={selectedId}
            selectedPart={selectedPart}
            onSelect={(elId, opts) => {
              if (!elId) {
                setSelectedId(null)
                setSelectedPart(null)
                return
              }
              selectElement(elId, { scroll: false, part: opts?.part !== undefined ? opts.part : null })
            }}
            onSelectPart={(part) => {
              setTab('structure')
              setSelectedPart(part)
              setMobileSheet('props')
            }}
            onPatchSettings={(id, patch) => apply(reduceLayout(layout, { type: 'updateSettings', id, settings: patch }))}
            onDropWidget={(parentId, widgetType) => addWidgetToCanvas(widgetType, parentId)}
          />
        </ProductEntityProvider>
      ) : (
        <LayoutRenderer
          layout={layout}
          editMode
          selectedId={selectedId}
          selectedPart={selectedPart}
          onSelect={(elId, opts) => {
            if (!elId) {
              setSelectedId(null)
              setSelectedPart(null)
              return
            }
            selectElement(elId, { scroll: false, part: opts?.part !== undefined ? opts.part : null })
          }}
          onSelectPart={(part) => {
            setTab('structure')
            setSelectedPart(part)
            setMobileSheet('props')
          }}
          onPatchSettings={(id, patch) => apply(reduceLayout(layout, { type: 'updateSettings', id, settings: patch }))}
          onDropWidget={(parentId, widgetType) => addWidgetToCanvas(widgetType, parentId)}
        />
      )}
    </div>
  )

  return (
    <div className="builder-shell flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#07070a] text-zinc-100">
      <header className="builder-topbar flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.07] px-2 pt-[env(safe-area-inset-top)] sm:gap-3 sm:px-3">
        <button type="button" className="builder-tool !h-10 !w-10 !px-0 shrink-0" title="К страницам" onClick={() => nav(adminUrl('/pages'))}>
          <ArrowLeft size={18} />
        </button>
        <input
          className="min-w-0 flex-1 border-none bg-transparent font-heading text-sm font-semibold outline-none"
          value={title}
          onChange={(e) => { setTitle(e.target.value); markDirty() }}
          aria-label="Название страницы"
        />
        <span
          className={clsx(
            'hidden max-w-[11rem] truncate rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline',
            statusTone,
          )}
          title={statusLabel}
        >
          {statusLabel}
        </span>
        {dirty && <span className="hidden text-[11px] text-amber-300 sm:inline">не сохранено</span>}
        <div className="hidden items-center gap-0.5 sm:flex">
          <button type="button" className="builder-tool !px-0 w-8" title="Отменить (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 size={14} />
          </button>
          <button type="button" className="builder-tool !px-0 w-8" title="Повторить (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
            <Redo2 size={14} />
          </button>
          <button
            type="button"
            className="builder-tool !px-0 w-8"
            title="Дублировать (Ctrl+D)"
            disabled={!selectedId}
            onClick={() => selectedId && duplicateSelected(selectedId)}
          >
            <Copy size={14} />
          </button>
          <button type="button" className="builder-tool !px-0 w-8" title="Вставить (Ctrl+V)" onClick={() => pasteClipboard()}>
            <ClipboardPaste size={14} />
          </button>
        </div>
        <div className="hidden items-center gap-0.5 md:flex">
          {([
            ['desktop', Monitor],
            ['tablet', Tablet],
            ['mobile', Smartphone],
          ] as const).map(([mode, Icon]) => (
            <button
              key={mode}
              type="button"
              className={clsx('builder-tool !px-0 w-8', device === mode && 'is-active')}
              onClick={() => setDevice(mode)}
              title={mode}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {publicPath && (
            <a
              href={publicPath}
              target="_blank"
              rel="noreferrer"
              className="builder-tool !hidden !h-10 !w-10 !px-0 sm:!inline-flex"
              title={published
                ? 'Открыть на сайте (как видит гость)'
                : 'Превью черновика — гости видят 404, пока не опубликуете'}
            >
              <ExternalLink size={16} />
            </a>
          )}
          <button
            type="button"
            className="builder-tool !h-10 !px-2.5 max-sm:!px-0 max-sm:!w-10"
            disabled={crud.save.isPending}
            onClick={() => save('draft')}
            title="Черновик"
          >
            <Save size={16} />
            <span className="hidden sm:inline">Черновик</span>
          </button>
          <button
            type="button"
            className="button admin-primary !min-h-10 !px-3"
            disabled={crud.save.isPending}
            onClick={() => save('published')}
          >
            {published ? 'OK' : 'Публ.'}
          </button>
        </div>
      </header>

      {(selectedId || selectedPart) && (
        <div className="builder-breadcrumb flex h-8 shrink-0 items-center gap-2 overflow-x-auto border-b border-white/[0.06] px-3 text-xs text-zinc-400">
          <span className="shrink-0 text-zinc-500">Редактируете:</span>
          {selectionPath.map((el, i) => (
            <span key={el.id} className="flex shrink-0 items-center gap-2">
              {i > 0 && <span className="text-zinc-600">›</span>}
              <button
                type="button"
                className={clsx(
                  'rounded px-1.5 py-0.5 hover:bg-white/5',
                  selectedId === el.id && !selectedPart && 'bg-white/10 text-white',
                )}
                onClick={() => selectElement(el.id)}
              >
                {elementLabel(el)}
              </button>
            </span>
          ))}
          {selectedPart && (
            <>
              <span className="text-zinc-600">›</span>
              <span className="rounded bg-[var(--accent,#8eb6ff)]/15 px-1.5 py-0.5 font-medium text-[var(--accent,#8eb6ff)]">
                {PART_LABELS[selectedPart] ?? selectedPart}
              </span>
            </>
          )}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <aside className="builder-sidepanel builder-sidepanel--left hidden w-[17.5rem] shrink-0 flex-col border-r border-white/[0.06] lg:flex">
          {leftPanelBody}
        </aside>

        <main
          ref={canvasScrollRef}
          className="builder-canvas-scroll admin-quiet-scroll min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-0 pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:p-5 lg:pb-5"
        >
          {canvas}
        </main>

        <aside className="builder-sidepanel builder-sidepanel--right admin-quiet-scroll hidden w-[18.5rem] shrink-0 overflow-y-auto border-l border-white/[0.06] p-4 lg:block">
          {propsPanelBody}
        </aside>

        {mobileSheet && (
          <div className="absolute inset-0 z-40 flex flex-col justify-end lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/55"
              aria-label="Закрыть"
              onClick={() => setMobileSheet(null)}
            />
            <div
              className={clsx(
                'builder-mobile-sheet relative z-10 flex max-h-[min(88dvh,920px)] flex-col rounded-t-2xl border border-white/10 bg-[#101012] shadow-2xl',
                mobileSheet === 'props' && 'min-h-[45dvh]',
              )}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {mobileSheet === 'nav' && (tab === 'widgets' ? 'Библиотека' : tab === 'structure' ? 'Структура' : tab === 'page' ? 'Страница' : 'Ревизии')}
                    {mobileSheet === 'props' && (selected ? (selectedPart ? (PART_LABELS[selectedPart] ?? selectedPart) : elementLabel(selected)) : 'Свойства')}
                    {mobileSheet === 'more' && 'Ещё'}
                  </p>
                  {dirty && <p className="text-[10px] text-amber-300">есть несохранённые правки</p>}
                </div>
                <button type="button" className="builder-tool !h-11 !w-11 !px-0" onClick={() => setMobileSheet(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className="admin-quiet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {mobileSheet === 'nav' && <div className="flex h-full min-h-[50dvh] flex-col">{leftPanelBody}</div>}
                {mobileSheet === 'props' && <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{propsPanelBody}</div>}
                {mobileSheet === 'more' && (
                  <div className="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600">Превью ширины</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ['desktop', Monitor, 'Десктоп'],
                        ['tablet', Tablet, 'Планшет'],
                        ['mobile', Smartphone, 'Телефон'],
                      ] as const).map(([mode, Icon, label]) => (
                        <button
                          key={mode}
                          type="button"
                          className={clsx(
                            'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border text-[11px]',
                            device === mode ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-white' : 'border-white/10 text-zinc-400',
                          )}
                          onClick={() => setDevice(mode)}
                        >
                          <Icon size={18} />
                          {label}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="builder-tool min-h-12 w-full justify-start !px-3" onClick={() => { setTab('page'); setMobileSheet('nav') }}>
                      <Settings2 size={16} /> Настройки страницы / SEO
                    </button>
                    <button type="button" className="builder-tool min-h-12 w-full justify-start !px-3" onClick={() => { setTab('revisions'); setMobileSheet('nav') }}>
                      <RotateCcw size={16} /> Ревизии
                    </button>
                    {(isHome || defaultLayoutForPage({ isHome, slug })) && (
                      <button type="button" className="builder-tool min-h-12 w-full justify-start !px-3" onClick={resetHomeLayout}>
                        <Home size={16} /> {isHome ? 'Сбросить шаблон главной' : 'Загрузить шаблон по умолчанию'}
                      </button>
                    )}
                    {publicPath && (
                      <a href={publicPath} target="_blank" rel="noreferrer" className="builder-tool min-h-12 w-full justify-start !px-3">
                        <ExternalLink size={16} /> {published ? 'Открыть на сайте' : 'Превью черновика'}
                      </a>
                    )}
                    <button
                      type="button"
                      className="button admin-primary min-h-12 w-full"
                      disabled={crud.save.isPending}
                      onClick={() => { save('published'); setMobileSheet(null) }}
                    >
                      {published ? 'Обновить на сайте' : 'Опубликовать'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <nav
        className="builder-mobile-dock fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0e0e10]/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid h-[3.75rem] grid-cols-4">
          <button
            type="button"
            className={clsx('builder-dock-btn', mobileSheet === 'nav' && tab === 'widgets' && 'is-active')}
            onClick={() => {
              setTab('widgets')
              setMobileSheet((s) => (s === 'nav' && tab === 'widgets' ? null : 'nav'))
            }}
          >
            <Boxes size={20} />
            <span>Добавить</span>
          </button>
          <button
            type="button"
            className={clsx('builder-dock-btn', mobileSheet === 'nav' && tab === 'structure' && 'is-active')}
            onClick={() => {
              setTab('structure')
              setMobileSheet((s) => (s === 'nav' && tab === 'structure' ? null : 'nav'))
            }}
          >
            <Layers size={20} />
            <span>Слои</span>
          </button>
          <button
            type="button"
            className={clsx('builder-dock-btn', mobileSheet === 'props' && 'is-active')}
            onClick={() => setMobileSheet((s) => (s === 'props' ? null : 'props'))}
          >
            <span className="relative">
              <PanelRight size={20} />
              {selected && <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-[var(--accent,#8eb6ff)]" />}
            </span>
            <span>Правка</span>
          </button>
          <button
            type="button"
            className={clsx('builder-dock-btn', mobileSheet === 'more' && 'is-active')}
            onClick={() => setMobileSheet((s) => (s === 'more' ? null : 'more'))}
          >
            <MoreHorizontal size={20} />
            <span>Ещё</span>
          </button>
        </div>
      </nav>

      {ctxMenu && (
        <BuilderContextMenu
          menu={ctxMenu}
          canPaste={Boolean(readBuilderClipboard())}
          hidden={isBuilderHidden(findElement(layout, ctxMenu.id))}
          onClose={() => setCtxMenu(null)}
          onDuplicate={() => duplicateSelected(ctxMenu.id)}
          onCopy={() => copySelected(ctxMenu.id)}
          onPaste={() => pasteClipboard()}
          onToggleHidden={() => toggleHidden(ctxMenu.id)}
          onMoveUp={() => moveSibling(ctxMenu.id, -1)}
          onMoveDown={() => moveSibling(ctxMenu.id, 1)}
          onDelete={() => removeSelected(ctxMenu.id)}
        />
      )}

      {helpOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => setHelpOpen(false)}>
          <div
            className="max-h-[min(80dvh,32rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#121214] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg text-white">Шорткаты конструктора</h2>
              <button type="button" className="builder-tool !h-9 !w-9 !px-0" onClick={() => setHelpOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <ul className="space-y-2 text-sm text-zinc-300">
              {[
                ['Ctrl+S', 'Сохранить'],
                ['Ctrl+Z / Ctrl+Y', 'Отменить / повторить'],
                ['Ctrl+D', 'Дублировать'],
                ['Ctrl+C / Ctrl+V', 'Копировать / вставить'],
                ['Delete', 'Удалить блок'],
                ['Alt+↑ / Alt+↓', 'Порядок среди соседей'],
                ['Esc', 'Снять выделение'],
                ['?', 'Эта справка'],
                ['ПКМ', 'Контекстное меню'],
              ].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5">
                  <span className="text-zinc-400">{v}</span>
                  <kbd className="rounded border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-200">{k}</kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function PageSettings({
  slug,
  seoTitle,
  seoDescription,
  ogImageId,
  scheduledAt,
  isHome,
  siteName,
  layout,
  onSlug,
  onSeoTitle,
  onSeoDescription,
  onOgImageId,
  onScheduledAt,
  onIsHome,
  onLayoutMeta,
  onEnableSnapPages,
}: {
  slug: string
  seoTitle: string
  seoDescription: string
  ogImageId: string | number | null
  scheduledAt: string
  isHome: boolean
  siteName: string
  layout: PageLayout
  onSlug: (v: string) => void
  onSeoTitle: (v: string) => void
  onSeoDescription: (v: string) => void
  onOgImageId: (v: string | number | null) => void
  onScheduledAt: (v: string) => void
  onIsHome: (v: boolean) => void
  onLayoutMeta: (patch: Record<string, unknown>) => void
  onEnableSnapPages: () => void
}) {
  const titleLen = seoTitle.length
  const descLen = seoDescription.length
  const previewTitle = (seoTitle.trim() || 'Заголовок страницы') + (siteName ? ` · ${siteName}` : '')
  const previewDesc = seoDescription.trim() || 'Краткое описание для поисковой выдачи появится здесь.'
  const previewUrl = isHome ? '/' : `/${slug || '…'}`
  const scheduleDate = scheduledAt
    ? new Date(scheduledAt.includes('T') ? scheduledAt : scheduledAt.replace(' ', 'T'))
    : null
  const scheduleFuture = Boolean(
    scheduleDate && !Number.isNaN(scheduleDate.getTime()) && scheduleDate.getTime() > Date.now(),
  )
  const scrollSnap = String(layout.meta?.scroll_snap || 'none')
  const scrollSmooth = layout.meta?.scroll_smooth !== false
  const snapHeight = String(layout.meta?.snap_height || '100dvh')

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">Скролл страницы</p>
        <label className="mb-3 block space-y-1 text-xs text-zinc-400">
          Перелистывание секций
          <select
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={scrollSnap}
            onChange={(e) => onLayoutMeta({ scroll_snap: e.target.value })}
          >
            <option value="none">Обычный скролл</option>
            <option value="proximity">Snap · мягкий</option>
            <option value="mandatory">Snap · как страницы</option>
          </select>
        </label>
        <label className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={scrollSmooth}
            onChange={(e) => onLayoutMeta({ scroll_smooth: e.target.checked })}
          />
          Плавный scroll-behavior
        </label>
        <label className="mb-3 block space-y-1 text-xs text-zinc-400">
          Высота секции-страницы
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={snapHeight}
            onChange={(e) => onLayoutMeta({ snap_height: e.target.value })}
            placeholder="100dvh"
          />
          <span className="text-[11px] text-zinc-600">Для секций без своего min-height, когда включён snap</span>
        </label>
        <button
          type="button"
          className="builder-tool mb-4 w-full justify-start !px-3"
          onClick={onEnableSnapPages}
          title="Включить mandatory snap + 100dvh + fade-up на все секции"
        >
          Включить «страницы» для всех секций
        </button>
        <p className="mb-4 text-[11px] leading-4 text-zinc-600">
          Колесо / свайп будет останавливаться на секциях. Анимацию появления задайте у каждой секции.
        </p>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">URL и SEO</p>
        <label className="mb-3 block space-y-1 text-xs text-zinc-400">
          Slug
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={slug}
            disabled={isHome}
            onChange={(e) => onSlug(e.target.value)}
            placeholder="about"
          />
          {isHome ? (
            <span className="text-[11px] text-zinc-600">У главной URL всегда /</span>
          ) : (
            <span className="text-[11px] text-zinc-600">/{slug || '…'}</span>
          )}
        </label>
        <label className="mb-3 block space-y-1 text-xs text-zinc-400">
          <span className="flex items-center justify-between gap-2">
            SEO title
            <span className={titleLen > 60 ? 'text-amber-400' : 'text-zinc-600'}>{titleLen}/60</span>
          </span>
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={seoTitle}
            onChange={(e) => onSeoTitle(e.target.value)}
          />
        </label>
        <label className="mb-3 block space-y-1 text-xs text-zinc-400">
          <span className="flex items-center justify-between gap-2">
            SEO description
            <span className={descLen > 160 ? 'text-amber-400' : 'text-zinc-600'}>{descLen}/160</span>
          </span>
          <textarea
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            rows={3}
            value={seoDescription}
            onChange={(e) => onSeoDescription(e.target.value)}
          />
        </label>
        <div className="mb-3">
          <MediaPicker
            label="OG изображение"
            kind="image"
            value={ogImageId}
            onChange={(v) => onOgImageId(v)}
          />
          <p className="mt-1 text-[11px] text-zinc-600">Картинка для соцсетей и превью ссылок.</p>
        </div>
        <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Превью Google</p>
          <p className="truncate text-[13px] text-[#8ab4f8]">{previewTitle}</p>
          <p className="truncate text-[11px] text-emerald-500/80">{previewUrl}</p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-zinc-400">{previewDesc}</p>
        </div>
        <label className="mb-1 block space-y-1 text-xs text-zinc-400">
          Отложенная публикация
          <input
            type="datetime-local"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={scheduledAt}
            onChange={(e) => onScheduledAt(e.target.value)}
          />
          <span className="text-[11px] text-zinc-600">
            {scheduleFuture
              ? 'Черновик сам станет опубликованным после этой даты при первом заходе на страницу.'
              : 'Оставьте пустым, чтобы не планировать. Страница остаётся черновиком до этой даты (публикуется при первом заходе).'}
          </span>
        </label>
        {scheduledAt ? (
          <button
            type="button"
            className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            onClick={() => onScheduledAt('')}
          >
            Сбросить расписание
          </button>
        ) : null}
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-zinc-500">
          Гость видит только статус «Опубликовано». Черновик и запланированные страницы на живом URL доступны только вам.
        </p>
      </div>
      <label className="flex items-start gap-2 rounded-lg border border-white/10 p-3 text-sm">
        <input type="checkbox" className="mt-0.5" checked={isHome} onChange={(e) => onIsHome(e.target.checked)} />
        <span>
          <span className="flex items-center gap-1.5 font-medium text-zinc-200">
            <Home size={14} /> Главная страница
          </span>
          <span className="mt-0.5 block text-[11px] text-zinc-500">Другая home снимется автоматически при сохранении.</span>
        </span>
      </label>
    </div>
  )
}

function WidgetPalette({
  title,
  items,
  onAdd,
}: {
  title: string
  items: ReturnType<typeof listWidgets>
  onAdd: (type: string) => void
}) {
  return (
    <div>
      <p className="builder-palette-label mb-2">{title}</p>
      <div className="grid grid-cols-3 gap-2">
        {items.map((w) => {
          const Icon = widgetIcon(w.type, w.category)
          const tone = widgetIconTone(w.category)
          return (
            <button
              key={w.type}
              type="button"
              draggable
              title={`${w.label} · клик — добавить · drag — на колонку`}
              onClick={() => onAdd(w.type)}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-builder-widget', w.type)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className="builder-palette-tile cursor-grab active:cursor-grabbing"
            >
              <span className={clsx('builder-palette-tile__icon', tone)}>
                <Icon size={18} strokeWidth={1.75} />
              </span>
              <span className="builder-palette-tile__label">{w.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function InsertSlot({
  mode,
  parentId,
  index,
  onInsert,
}: {
  mode: 'section' | 'column' | 'widget'
  parentId: string | null
  index: number
  onInsert: (
    kind: 'section' | 'column' | 'widget',
    parentId: string | null,
    index: number,
    widgetType?: string,
  ) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const widgets = useMemo(() => listWidgets(), [])
  const byCat = useMemo(() => {
    const map = new Map<string, typeof widgets>()
    for (const w of widgets) {
      const key = w.category || 'other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(w)
    }
    return [...map.entries()]
  }, [widgets])

  const hint =
    mode === 'section' ? 'Вставить секцию'
      : mode === 'column' ? 'Вставить колонку'
        : 'Вставить виджет'

  return (
    <div ref={ref} className="group/slot relative py-1 lg:py-0.5">
      <div className="flex h-8 items-center justify-center lg:h-3">
        <button
          type="button"
          title={hint}
          className={clsx(
            'flex items-center justify-center rounded-full border text-zinc-500 transition',
            'h-8 w-8 lg:h-4 lg:w-4',
            open
              ? 'border-[var(--accent,#8eb6ff)] bg-[var(--accent,#8eb6ff)]/20 text-[var(--accent,#8eb6ff)]'
              : 'border-white/15 bg-white/[0.04] opacity-100 hover:border-white/25 hover:bg-white/10 hover:text-white lg:border-transparent lg:bg-transparent lg:opacity-0 lg:group-hover/slot:opacity-100',
          )}
          onClick={() => {
            if (mode === 'section') {
              onInsert('section', null, index)
              return
            }
            if (mode === 'column' && parentId) {
              onInsert('column', parentId, index)
              return
            }
            setOpen((v) => !v)
          }}
        >
          <Plus size={14} className="lg:hidden" />
          <Plus size={10} className="hidden lg:block" />
        </button>
      </div>
      {open && mode === 'widget' && parentId && (
        <div className="absolute left-0 right-0 z-30 mt-0.5 max-h-[min(50dvh,16rem)] overflow-y-auto rounded-xl border border-white/15 bg-[#16161a] p-2 shadow-xl lg:max-h-56 lg:rounded-lg lg:p-1.5">
          <p className="mb-1 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Тип виджета</p>
          {byCat.map(([cat, items]) => (
            <div key={cat} className="mb-1.5">
              <p className="px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-600">
                {PALETTE_LABELS[cat] ?? cat}
              </p>
              {items.map((w) => {
                const Icon = widgetIcon(w.type, w.category)
                return (
                  <button
                    key={w.type}
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-300 hover:bg-white/10 hover:text-white lg:min-h-0 lg:rounded-md lg:px-1.5 lg:py-1 lg:text-[11px]"
                    onClick={() => {
                      onInsert('widget', parentId, index, w.type)
                      setOpen(false)
                    }}
                  >
                    <Icon size={14} className={clsx('shrink-0 opacity-90', widgetIconTone(w.category))} />
                    <span className="truncate">{w.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StructureTree({
  layout,
  selectedId,
  selectedPart,
  onSelect,
  onSelectPart,
  onRemove,
  onMove,
  onReorder,
  onMoveTo,
  onToggleHidden,
  onInsert,
  onContextMenu,
}: {
  layout: PageLayout
  selectedId: string | null
  selectedPart: string | null
  onSelect: (id: string) => void
  onSelectPart: (id: string, part: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onReorder: (id: string, toIndex: number) => void
  onMoveTo: (id: string, targetParentId: string, index: number) => void
  onToggleHidden: (id: string) => void
  onInsert: (
    kind: 'section' | 'column' | 'widget',
    parentId: string | null,
    index: number,
    widgetType?: string,
  ) => void
  onContextMenu: (id: string, x: number, y: number) => void
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dragMeta, setDragMeta] = useState<{ id: string; parentKey: string; elType: string } | null>(null)
  const [dropHint, setDropHint] = useState<{ parentKey: string; index: number } | null>(null)
  const treeScrollRef = useRef<HTMLDivElement | null>(null)

  // Expand ancestors + scroll to selection when canvas click opens the inspector.
  useEffect(() => {
    if (!selectedId) return
    const path = findElementPath(layout, selectedId)
    setCollapsed((prev) => {
      const next = { ...prev }
      for (const el of path) next[el.id] = false
      return next
    })
    requestAnimationFrame(() => {
      const sel = selectedPart
        ? treeScrollRef.current?.querySelector(`[data-tree-part="${CSS.escape(selectedId)}:${CSS.escape(selectedPart)}"]`)
        : treeScrollRef.current?.querySelector(`[data-tree-id="${CSS.escape(selectedId)}"]`)
      sel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [selectedId, selectedPart, layout])

  const labelOf = (el: BuilderElementDTO) => {
    if (el.elType === 'section') return 'Секция'
    if (el.elType === 'column') return 'Колонка'
    return listWidgets().find((w) => w.type === el.widgetType)?.label ?? el.widgetType ?? 'Виджет'
  }

  const typeHint = (el: BuilderElementDTO) => {
    if (el.elType === 'section') return 'sec'
    if (el.elType === 'column') return 'col'
    return 'w'
  }

  const insertModeFor = (parent: BuilderElementDTO | null): 'section' | 'column' | 'widget' => {
    if (!parent) return 'section'
    if (parent.elType === 'section') return 'column'
    return 'widget'
  }

  const widgetParts = (el: BuilderElementDTO) => {
    if (el.elType !== 'widget' || !el.widgetType) return []
    const def = listWidgets().find((w) => w.type === el.widgetType)
    return (def?.settingsFields ?? []).filter((f) => f.type !== 'hidden' && f.type !== 'custom')
  }

  const parentKeyOf = (parentId: string | null) => parentId ?? '__root__'

  const toggle = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  const renderList = (
    els: BuilderElementDTO[],
    parent: BuilderElementDTO | null,
    depth = 0,
  ) => {
    const parentId = parent?.id ?? null
    const parentKey = parentKeyOf(parentId)
    const insertMode = insertModeFor(parent)

    return (
      <ul className={depth ? 'ml-2 space-y-0 border-l border-white/10 pl-1.5' : 'space-y-0'}>
        <li>
          <InsertSlot mode={insertMode} parentId={parentId} index={0} onInsert={onInsert} />
        </li>
        {!els.length && dragMeta && (() => {
          const dragged = findElement(layout, dragMeta.id)
          if (!dragged || !canAcceptChild(parent, dragged)) return null
          return (
            <li
              className="rounded-lg border border-dashed border-[var(--accent,#8eb6ff)]/40 px-2 py-3 text-center text-[11px] text-zinc-500"
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setDropHint({ parentKey, index: 0 })
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onMoveTo(dragMeta.id, parentId ?? '__root__', 0)
                setDragMeta(null)
                setDropHint(null)
              }}
            >
              Отпустите сюда
            </li>
          )
        })()}
        {els.map((el, i) => {
          const canNest = el.elType === 'section' || el.elType === 'column'
          const parts = widgetParts(el)
          const hasKids = canNest || parts.length > 0 || Boolean(el.elements?.length)
          const isCollapsed = collapsed[el.id]
          const selected = selectedId === el.id && !selectedPart
          const dragging = dragMeta?.id === el.id
          const hidden = isBuilderHidden(el)
          const showDropBefore = dropHint?.parentKey === parentKey && dropHint.index === i && dragMeta?.id !== el.id

          return (
            <li key={el.id}>
              {showDropBefore && (
                <div className="mb-0.5 h-0.5 rounded-full bg-[var(--accent,#8eb6ff)]" />
              )}
              <div
                data-tree-id={el.id}
                draggable
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onContextMenu(el.id, e.clientX, e.clientY)
                }}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    'application/x-builder-reorder',
                    JSON.stringify({ id: el.id, parentKey, elType: el.elType }),
                  )
                  e.dataTransfer.effectAllowed = 'move'
                  setDragMeta({ id: el.id, parentKey, elType: el.elType })
                }}
                onDragEnd={() => {
                  setDragMeta(null)
                  setDropHint(null)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!dragMeta) {
                    setDropHint(null)
                    return
                  }
                  const dragged = findElement(layout, dragMeta.id)
                  if (!dragged || !canAcceptChild(parent, dragged)) {
                    setDropHint(null)
                    return
                  }
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const before = e.clientY < rect.top + rect.height / 2
                  setDropHint({ parentKey, index: before ? i : i + 1 })
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  try {
                    const raw = e.dataTransfer.getData('application/x-builder-reorder')
                    const data = JSON.parse(raw || '{}') as { id?: string; parentKey?: string }
                    const id = data.id ?? dragMeta?.id
                    const fromKey = data.parentKey ?? dragMeta?.parentKey
                    if (!id || !fromKey) return
                    const dragged = findElement(layout, id)
                    if (!dragged || !canAcceptChild(parent, dragged)) return
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    const before = e.clientY < rect.top + rect.height / 2
                    let toIndex = before ? i : i + 1
                    if (fromKey === parentKey) {
                      const from = els.findIndex((x) => x.id === id)
                      if (from < 0) return
                      if (from < toIndex) toIndex -= 1
                      if (toIndex !== from) onReorder(id, toIndex)
                    } else {
                      onMoveTo(id, parentId ?? '__root__', toIndex)
                    }
                  } catch {
                    /* ignore */
                  }
                  setDragMeta(null)
                  setDropHint(null)
                }}
                className={clsx(
                  'group flex min-h-11 items-center gap-0.5 rounded-lg px-1 py-1.5 text-xs lg:min-h-0 lg:rounded-md lg:py-1',
                  selected ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5',
                  dragging && 'opacity-40',
                  hidden && 'opacity-55',
                )}
              >
                <span
                  className="hidden cursor-grab touch-none p-1 text-zinc-600 active:cursor-grabbing group-hover:text-zinc-400 lg:inline-flex"
                  title="Перетащить (можно в другую колонку)"
                  aria-hidden
                >
                  <GripVertical size={12} />
                </span>
                {hasKids ? (
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:text-white lg:h-auto lg:w-auto lg:rounded lg:p-0.5"
                    onClick={() => toggle(el.id)}
                    title={isCollapsed ? 'Развернуть' : 'Свернуть'}
                  >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                ) : (
                  <span className="w-4" />
                )}
                <span className="hidden w-5 shrink-0 text-[9px] uppercase tracking-wide text-zinc-600 sm:inline">{typeHint(el)}</span>
                <button
                  type="button"
                  className={clsx('min-w-0 flex-1 truncate py-1 text-left text-sm lg:text-xs', hidden && 'line-through decoration-zinc-600')}
                  onClick={() => onSelect(el.id)}
                >
                  {labelOf(el)}
                </button>
                <button
                  type="button"
                  className={clsx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md lg:h-auto lg:w-auto lg:rounded lg:p-0.5 lg:group-hover:visible',
                    hidden ? 'text-amber-300/90 lg:visible' : 'text-zinc-500 hover:text-white lg:invisible',
                  )}
                  title={hidden ? 'Показать на сайте' : 'Скрыть с сайта (для всех)'}
                  onClick={() => onToggleHidden(el.id)}
                >
                  {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:text-white disabled:opacity-30 lg:h-auto lg:w-auto lg:invisible lg:rounded lg:p-0.5 lg:group-hover:visible"
                  disabled={i === 0}
                  title="Выше"
                  onClick={() => onMove(el.id, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:text-white disabled:opacity-30 lg:h-auto lg:w-auto lg:invisible lg:rounded lg:p-0.5 lg:group-hover:visible"
                  disabled={i >= els.length - 1}
                  title="Ниже"
                  onClick={() => onMove(el.id, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-red-300 lg:h-auto lg:w-auto lg:invisible lg:rounded lg:p-0.5 lg:group-hover:visible"
                  onClick={() => onRemove(el.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {!isCollapsed && canNest && renderList(el.elements ?? [], el, depth + 1)}
              {!isCollapsed && parts.length > 0 && (
                <ul className="ml-2 space-y-0.5 border-l border-white/10 pl-1.5">
                  {parts.map((field) => {
                    const partSelected = selectedId === el.id && selectedPart === field.key
                    return (
                      <li key={field.key}>
                        <button
                          type="button"
                          data-tree-part={`${el.id}:${field.key}`}
                          className={clsx(
                            'flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px]',
                            partSelected
                              ? 'bg-[var(--accent,#8eb6ff)]/15 text-[var(--accent,#8eb6ff)]'
                              : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300',
                          )}
                          onClick={() => onSelectPart(el.id, field.key)}
                        >
                          <span className="w-5 shrink-0 text-[9px] uppercase tracking-wide text-zinc-600">·</span>
                          <span className="truncate">{PART_LABELS[field.key] ?? field.label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <InsertSlot mode={insertMode} parentId={parentId} index={i + 1} onInsert={onInsert} />
              {dropHint?.parentKey === parentKey && dropHint.index === els.length && i === els.length - 1 && dragMeta?.id !== el.id && (
                <div className="mt-0.5 h-0.5 rounded-full bg-[var(--accent,#8eb6ff)]" />
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  if (!layout.elements.length) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-zinc-500">Пусто — вставьте секцию.</p>
        <InsertSlot mode="section" parentId={null} index={0} onInsert={onInsert} />
      </div>
    )
  }

  return (
    <div ref={treeScrollRef} className="space-y-2">
      <p className="text-[10px] leading-4 text-zinc-600">
        «+» — вставка · drag между колонками · ПКМ — меню · глазик — скрыть.
      </p>
      {renderList(layout.elements, null)}
    </div>
  )
}

function SettingsFieldControl({
  field,
  settings,
  selectedPart,
  fieldClass,
  onChange,
}: {
  field: SettingsField
  settings: Record<string, unknown>
  selectedPart: string | null
  fieldClass: (key: string) => string
  onChange: (patch: Record<string, unknown>) => void
}) {
  const value = settings[field.key]
  const bindable = 'bindable' in field && field.bindable
  const dynamicKey = `${field.key}_dynamic`
  const bindKey = `${field.key}_bind`
  const isDynamic = Boolean(settings[dynamicKey])

  const bindControls = bindable ? (
    <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={isDynamic}
          onChange={(e) => onChange({
            [dynamicKey]: e.target.checked,
            ...(e.target.checked && !settings[bindKey] ? { [bindKey]: field.type === 'media' ? 'media_id' : 'title' } : {}),
          })}
        />
        Динамическое из товара
      </label>
      {isDynamic ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-[11px] text-zinc-500">
            Поле товара
            <select
              className="w-full"
              value={
                PRODUCT_BIND_OPTIONS.some((o) => o.value === String(settings[bindKey] ?? ''))
                  ? String(settings[bindKey] ?? '')
                  : (String(settings[bindKey] ?? '') && String(settings[bindKey]) !== '__custom__'
                    ? '__custom__'
                    : String(settings[bindKey] ?? 'title'))
              }
              onChange={(e) => {
                const v = e.target.value
                if (v === '__custom__') {
                  onChange({
                    [bindKey]: '__custom__',
                    [`${field.key}_bind_custom`]: String(settings[`${field.key}_bind_custom`] || settings[bindKey] || 'attrs.'),
                  })
                } else {
                  onChange({ [bindKey]: v })
                }
              }}
            >
              {PRODUCT_BIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {(String(settings[bindKey] ?? '') === '__custom__'
            || (String(settings[bindKey] ?? '') !== ''
              && !PRODUCT_BIND_OPTIONS.some((o) => o.value === String(settings[bindKey]) && o.value !== '__custom__'))) ? (
            <label className="block space-y-1 text-[11px] text-zinc-500">
              Путь (например attrs.my_field)
              <input
                className="w-full font-mono text-xs"
                value={
                  String(settings[bindKey] ?? '') === '__custom__'
                    ? String(settings[`${field.key}_bind_custom`] ?? '')
                    : String(settings[bindKey] ?? '')
                }
                onChange={(e) => onChange({
                  [bindKey]: '__custom__',
                  [`${field.key}_bind_custom`]: e.target.value,
                })}
                placeholder="attrs.category"
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null

  if (field.type === 'toggle') {
    return (
      <label key={field.key} className={clsx('flex items-center gap-2 text-sm rounded-lg p-2 -mx-2', selectedPart === field.key && 'bg-[var(--accent,#8eb6ff)]/10 ring-1 ring-[var(--accent,#8eb6ff)]/40')}>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange({ [field.key]: e.target.checked })} />
        {field.label}
      </label>
    )
  }
  if (field.type === 'select') {
    return (
      <label key={field.key} className={fieldClass(field.key)}>
        {field.label}
        <select className="w-full" value={String(value ?? '')} onChange={(e) => onChange({ [field.key]: e.target.value })}>
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    )
  }
  if (field.type === 'media') {
    return (
      <div key={field.key} className={fieldClass(field.key)}>
        {!isDynamic ? (
          <MediaPicker
            label={field.label}
            value={value as string | number | null | undefined}
            onChange={(v) => onChange({ [field.key]: v })}
          />
        ) : (
          <p className="text-xs text-zinc-500">{field.label}: из поля товара</p>
        )}
        {bindControls}
      </div>
    )
  }
  if (field.type === 'custom') {
    const Comp = field.component
    return (
      <div key={field.key} className={fieldClass(field.key)}>
        <p className="mb-1.5 text-xs text-zinc-400">{field.label}</p>
        <Comp value={value} onChange={(v) => onChange({ [field.key]: v })} />
      </div>
    )
  }
  if (field.type === 'json') {
    return (
      <div key={field.key} className={fieldClass(field.key)}>
        <label className="block space-y-1 text-xs text-zinc-400">
          {field.label}
          <textarea
            className="w-full font-mono text-[11px]"
            rows={6}
            value={typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2)}
            onChange={(e) => {
              try {
                onChange({ [field.key]: JSON.parse(e.target.value) })
              } catch {
                onChange({ [field.key]: e.target.value })
              }
            }}
          />
        </label>
      </div>
    )
  }
  if (field.type === 'richtext') {
    return (
      <div key={field.key} className={fieldClass(field.key)}>
        <span className="text-xs text-zinc-400">{field.label}</span>
        {!isDynamic ? (
          <RichTextEditor value={String(value ?? '')} onChange={(v) => onChange({ [field.key]: v })} />
        ) : (
          <p className="mt-1 text-[11px] text-zinc-500">Контент подставится из выбранного поля товара</p>
        )}
        {bindControls}
      </div>
    )
  }
  if (field.type === 'textarea') {
    return (
      <div key={field.key} className={fieldClass(field.key)}>
        <label className="block space-y-1 text-xs text-zinc-400">
          {field.label}
          {!isDynamic ? (
            <textarea className="w-full" rows={4} value={String(value ?? '')} onChange={(e) => onChange({ [field.key]: e.target.value })} />
          ) : (
            <p className="text-[11px] text-zinc-500">Текст из поля товара</p>
          )}
        </label>
        {bindControls}
      </div>
    )
  }
  if (!isDynamic && field.type === 'color') {
    return (
      <div key={field.key} className={fieldClass(field.key)}>
        <ColorControl
          label={field.label}
          value={String(value ?? '')}
          onChange={(v) => onChange({ [field.key]: v })}
          allowGradient
          gradientPreset={/bg|background|fill|фон/i.test(field.key + field.label) ? 'fill' : 'text'}
          allowEmpty
          emptyHint="пусто = акцент сайта"
        />
        {bindControls}
      </div>
    )
  }

  return (
    <div key={field.key} className={fieldClass(field.key)}>
      <label className="block space-y-1 text-xs text-zinc-400">
        {field.label}
        {!isDynamic ? (
          <input
            className="w-full"
            type={field.type === 'number' ? 'number' : 'text'}
            value={String(value ?? '')}
            onChange={(e) => onChange({ [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value })}
          />
        ) : (
          <p className="text-[11px] text-zinc-500">Значение из поля товара</p>
        )}
      </label>
      {bindControls}
    </div>
  )
}

function VisibilityControl({
  hidden,
  onChange,
}: {
  hidden: boolean
  onChange: (hidden: boolean) => void
}) {
  return (
    <button
      type="button"
      className={clsx(
        'builder-tool flex w-full items-center justify-between gap-2 !px-3',
        hidden && '!border-amber-400/30 !text-amber-200',
      )}
      onClick={() => onChange(!hidden)}
      title={hidden ? 'Сейчас скрыто на сайте для всех' : 'Видно на сайте'}
    >
      <span className="flex items-center gap-2 text-xs">
        {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        {hidden ? 'Скрыто на сайте' : 'Показано на сайте'}
      </span>
      <span className="text-[10px] text-zinc-500">{hidden ? 'для всех' : 'глазик'}</span>
    </button>
  )
}

/** Related fields shown together when a part is selected (e.g. button label + href). */
const PART_FIELD_GROUPS: Record<string, string[]> = {
  primary_cta_label: ['primary_cta_label', 'primary_cta_href'],
  primary_cta_href: ['primary_cta_label', 'primary_cta_href'],
  secondary_cta_label: ['secondary_cta_label', 'secondary_cta_href'],
  secondary_cta_href: ['secondary_cta_label', 'secondary_cta_href'],
  cta_label: ['cta_label', 'cta_href'],
  cta_href: ['cta_label', 'cta_href'],
  label: ['label', 'href'],
  href: ['label', 'href'],
}

function ElementSettings({
  element,
  selectedPart,
  onChange,
  onClearPart,
  onRemove,
}: {
  element: NonNullable<ReturnType<typeof findElement>>
  selectedPart: string | null
  onChange: (settings: Record<string, unknown>) => void
  onClearPart: () => void
  onRemove: () => void
}) {
  const def = element.widgetType ? listWidgets().find((w) => w.type === element.widgetType) : null
  const { data: site } = useSite()
  const { data: profile } = useProfile()
  const rawSettings = element.settings ?? {}
  const settings = useMemo(
    () =>
      resolveEditorSettings(element.widgetType, rawSettings, def?.defaultSettings ?? {}, {
        site: site ?? null,
        profile: profile ?? null,
      }),
    [element.widgetType, rawSettings, def?.defaultSettings, site, profile],
  )
  const hidden = isBuilderHidden(element)

  /** Persist what the panel shows: seed empty raw keys from resolved, then apply patch. */
  const commit = (patch: Record<string, unknown>) => {
    const seeded: Record<string, unknown> = { ...rawSettings }
    for (const [k, v] of Object.entries(settings)) {
      if (k === 'styles') continue
      // Only seed keys never written — do not refill cleared ''.
      if (Object.prototype.hasOwnProperty.call(rawSettings, k) && rawSettings[k] != null) continue
      if (!(k in rawSettings) && v != null && !(typeof v === 'string' && v.trim() === '')) {
        seeded[k] = v
      }
    }
    if (patch.styles && typeof patch.styles === 'object') {
      onChange({
        ...seeded,
        styles: { ...readStyles(rawSettings), ...(patch.styles as object) },
        ...Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'styles')),
      })
      return
    }
    onChange({ ...seeded, ...patch })
  }

  const fieldClass = (key: string) => clsx(
    'block space-y-1 text-xs text-zinc-400 rounded-lg p-2 -mx-2 transition',
    selectedPart === key && 'bg-[var(--accent,#8eb6ff)]/10 ring-1 ring-[var(--accent,#8eb6ff)]/40',
  )

  const allFields = def?.settingsFields ?? []
  const partKeys = selectedPart
    ? (PART_FIELD_GROUPS[selectedPart] ?? [selectedPart])
    : null
  const focusedFields = partKeys
    ? allFields.filter((f) => partKeys.includes(f.key))
    : allFields

  if (element.elType === 'section') {
    return (
      <div className="space-y-4">
        <h3 className="font-heading text-sm font-semibold">Секция</h3>
        <p className="text-[11px] text-zinc-500">Layout · атмосфера · анимация · responsive</p>
        <VisibilityControl hidden={hidden} onChange={(v) => commit({ hidden: v })} />
        <label className={fieldClass('paddingY')}>
          Отступ по вертикали
          <input className="w-full" value={String(settings.paddingY ?? '3rem')} onChange={(e) => commit({ paddingY: e.target.value })} />
        </label>
        <label className={fieldClass('gap')}>
          Gap между колонками
          <input className="w-full" value={String(settings.gap ?? '1.5rem')} onChange={(e) => commit({ gap: e.target.value })} />
        </label>
        <label className={fieldClass('htmlId')}>
          HTML id (якорь)
          <input className="w-full" value={String(settings.htmlId ?? '')} onChange={(e) => commit({ htmlId: e.target.value })} placeholder="how-it-works" />
        </label>
        <label className={fieldClass('min_height')}>
          Min-height
          <input className="w-full" value={String(settings.min_height ?? '')} onChange={(e) => commit({ min_height: e.target.value })} placeholder="100dvh / 70vh" />
        </label>
        <label className={fieldClass('v_align')}>
          Вертикаль контента
          <select className="w-full" value={String(settings.v_align ?? 'start')} onChange={(e) => commit({ v_align: e.target.value })}>
            <option value="start">Сверху</option>
            <option value="center">По центру</option>
            <option value="end">Снизу</option>
          </select>
        </label>
        <label className={fieldClass('scroll_snap')}>
          Snap этой секции
          <select className="w-full" value={String(settings.scroll_snap ?? 'auto')} onChange={(e) => commit({ scroll_snap: e.target.value })}>
            <option value="auto">Как у страницы</option>
            <option value="start">Всегда · start</option>
            <option value="center">Всегда · center</option>
            <option value="end">Всегда · end</option>
            <option value="off">Выкл (не стопорить)</option>
          </select>
        </label>
        <label className={fieldClass('snap_stop')}>
          Snap stop
          <select className="w-full" value={String(settings.snap_stop ?? 'always')} onChange={(e) => commit({ snap_stop: e.target.value })}>
            <option value="always">Always (как страница)</option>
            <option value="normal">Normal</option>
          </select>
        </label>
        <label className={fieldClass('content_max_width')}>
          Max-width контента
          <input className="w-full" value={String(settings.content_max_width ?? '')} onChange={(e) => commit({ content_max_width: e.target.value })} placeholder="72rem" />
        </label>
        <label className={clsx(fieldClass('full_bleed'), 'flex items-center gap-2')}>
          <input type="checkbox" checked={settings.full_bleed === true} onChange={(e) => commit({ full_bleed: e.target.checked })} />
          Full-bleed (без контейнера)
        </label>
        <div className={fieldClass('background')}>
          <ColorControl
            label="Фон секции"
            value={String(settings.background ?? '')}
            onChange={(v) => commit({ background: v })}
            allowGradient
            allowEmpty
            emptyHint="прозрачный"
          />
        </div>
        <div className={fieldClass('overlay')}>
          <ColorControl
            label="Оверлей"
            value={String(settings.overlay ?? '')}
            onChange={(v) => commit({ overlay: v })}
            allowGradient
            allowEmpty
            emptyHint="нет"
          />
        </div>
        <label className={fieldClass('overlay_opacity')}>
          Прозрачность оверлея (0–1)
          <input className="w-full" value={String(settings.overlay_opacity ?? '0.35')} onChange={(e) => commit({ overlay_opacity: e.target.value })} />
        </label>
        <label className={clsx(fieldClass('glow'), 'flex items-center gap-2')}>
          <input type="checkbox" checked={settings.glow === true} onChange={(e) => commit({ glow: e.target.checked })} />
          Glow / атмосфера (радиальные пятна)
        </label>
        <label className={fieldClass('animation')}>
          Анимация появления
          <select className="w-full" value={String(settings.animation ?? 'none')} onChange={(e) => commit({ animation: e.target.value })}>
            <option value="none">Нет</option>
            <option value="fade-up">Fade up</option>
            <option value="fade">Fade</option>
            <option value="slide-up">Slide up</option>
            <option value="scale-in">Scale in</option>
            <option value="blur-up">Blur up</option>
          </select>
        </label>
        <label className={clsx(fieldClass('hide_on_mobile'), 'flex items-center gap-2')}>
          <input type="checkbox" checked={settings.hide_on_mobile === true} onChange={(e) => commit({ hide_on_mobile: e.target.checked })} />
          Скрыть на мобиле
        </label>
        <label className={clsx(fieldClass('hide_on_desktop'), 'flex items-center gap-2')}>
          <input type="checkbox" checked={settings.hide_on_desktop === true} onChange={(e) => commit({ hide_on_desktop: e.target.checked })} />
          Скрыть на десктопе
        </label>
        <StyleFields
          styles={readStyles(rawSettings)}
          onChange={(patch) => commit({ styles: { ...readStyles(rawSettings), ...patch } })}
        />
        <button type="button" className="builder-tool w-full text-red-300/90 hover:!text-red-200" onClick={onRemove}>
          <Trash2 size={13} /> Удалить секцию
        </button>
      </div>
    )
  }

  if (element.elType === 'column') {
    return (
      <div className="space-y-4">
        <h3 className="font-heading text-sm font-semibold">Колонка</h3>
        <p className="text-[11px] text-zinc-500">Только эта колонка</p>
        <VisibilityControl hidden={hidden} onChange={(v) => commit({ hidden: v })} />
        <label className={fieldClass('width')}>
          Ширина %
          <input className="w-full" type="number" min={10} max={100} value={Number(settings.width || 100)} onChange={(e) => commit({ width: Number(e.target.value) })} />
        </label>
        <label className={clsx(fieldClass('hide_on_mobile'), 'flex items-center gap-2')}>
          <input type="checkbox" checked={settings.hide_on_mobile === true} onChange={(e) => commit({ hide_on_mobile: e.target.checked })} />
          Скрыть на мобиле
        </label>
        <label className={clsx(fieldClass('hide_on_desktop'), 'flex items-center gap-2')}>
          <input type="checkbox" checked={settings.hide_on_desktop === true} onChange={(e) => commit({ hide_on_desktop: e.target.checked })} />
          Скрыть на десктопе
        </label>
        <StyleFields
          styles={readStyles(rawSettings)}
          onChange={(patch) => commit({ styles: { ...readStyles(rawSettings), ...patch } })}
        />
        <button type="button" className="builder-tool w-full text-red-300/90 hover:!text-red-200" onClick={onRemove}>
          <Trash2 size={13} /> Удалить колонку
        </button>
      </div>
    )
  }

  const widgetLabel = def?.label ?? element.widgetType ?? 'Виджет'
  const partLabel = selectedPart
    ? (PART_LABELS[selectedPart]
      ?? allFields.find((f) => f.key === selectedPart)?.label
      ?? selectedPart)
    : null

  // Focused part inspector — only the selected object inside the widget.
  if (selectedPart) {
    const isMedia = focusedFields.some((f) => f.type === 'media') || selectedPart.includes('background') || selectedPart.includes('media')
    // Prefer content field over href for styles (button text, not link URL).
    const styleKey = (partKeys ?? [selectedPart]).find((k) => !k.includes('href')) ?? selectedPart
    return (
      <div className="space-y-4">
        <div>
          <button
            type="button"
            className="mb-2 text-[11px] text-zinc-500 hover:text-[var(--accent,#8eb6ff)]"
            onClick={onClearPart}
          >
            ← {widgetLabel}
          </button>
          <h3 className="font-heading text-sm font-semibold text-white">
            {partLabel}
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500">Контент и стили только этого блока</p>
        </div>
        {focusedFields.length ? (
          focusedFields.map((field) => (
            <SettingsFieldControl
              key={field.key}
              field={field}
              settings={settings}
              selectedPart={selectedPart}
              fieldClass={fieldClass}
              onChange={commit}
            />
          ))
        ) : (
          <p className="text-sm text-zinc-500">Нет полей контента для «{partLabel}».</p>
        )}
        <StyleFields
          title="Стили блока"
          variant={isMedia ? 'media' : 'text'}
          styles={readFieldStyles(rawSettings, styleKey)}
          onChange={(patch) => {
            const prev = readFieldStyles(rawSettings, styleKey)
            const bag = (rawSettings.fieldStyles && typeof rawSettings.fieldStyles === 'object')
              ? { ...(rawSettings.fieldStyles as Record<string, unknown>) }
              : {}
            commit({
              fieldStyles: {
                ...bag,
                [styleKey]: { ...prev, ...patch },
              },
            })
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-sm font-semibold">{widgetLabel}</h3>
        <p className="mt-1 text-[11px] text-zinc-500">Виджет целиком · клик по тексту на холсте — отдельное поле</p>
      </div>
      <VisibilityControl hidden={hidden} onChange={(v) => commit({ hidden: v })} />
      {allFields.map((field) => (
        <SettingsFieldControl
          key={field.key}
          field={field}
          settings={settings}
          selectedPart={selectedPart}
          fieldClass={fieldClass}
          onChange={commit}
        />
      ))}
      <StyleFields
        title="Стили виджета"
        variant="all"
        styles={readStyles(rawSettings)}
        onChange={(patch) => commit({ styles: { ...readStyles(rawSettings), ...patch } })}
      />
      <button type="button" className="builder-tool w-full text-red-300/90 hover:!text-red-200" onClick={onRemove}>
        <Trash2 size={13} /> Удалить виджет
      </button>
    </div>
  )
}
