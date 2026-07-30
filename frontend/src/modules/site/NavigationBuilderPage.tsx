import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Link2,
  Menu,
  PanelBottom,
  PanelTop,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { endpoints } from '@/lib/api'
import { useAdminList, useAdminSingleton, useCrud } from '@/hooks/useApi'
import { AdminPageHero, AdminSectionLabel } from '@/admin/components/AdminPageHero'
import { Button, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import type { NavItem, SiteSettings } from '@/types'

type Loc = 'header' | 'footer' | 'both'
type NavRow = NavItem & {
  parent_id?: number | null
  location?: Loc | string
  target?: '_self' | '_blank'
}

type Draft = {
  label: string
  href: string
  target: '_self' | '_blank'
  location: Loc
  is_visible: boolean
}

const EMPTY_DRAFT: Draft = {
  label: '',
  href: '/',
  target: '_self',
  location: 'header',
  is_visible: true,
}

function locOf(item: NavRow): Loc {
  const v = String(item.location || 'header')
  if (v === 'footer' || v === 'both') return v
  return 'header'
}

function visible(item: NavRow) {
  return item.is_visible !== 0 && item.is_visible !== false
}

function sortRows(rows: NavRow[]) {
  return rows.slice().sort((a, b) => {
    const sa = Number(a.sort_order ?? 0)
    const sb = Number(b.sort_order ?? 0)
    if (sa !== sb) return sa - sb
    return Number(a.id) - Number(b.id)
  })
}

function inZone(item: NavRow, zone: 'header' | 'footer') {
  const loc = locOf(item)
  return loc === zone || loc === 'both'
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('tel:')
}

function publicHref(href: string) {
  const h = (href || '').trim()
  if (!h) return '/'
  if (isExternalHref(h) || h.startsWith('/')) return h
  return `/${h}`
}

export function NavigationBuilderPage() {
  const client = useQueryClient()
  const { data, isLoading } = useAdminList<NavRow>('navigation')
  const { data: siteSettings } = useAdminSingleton<SiteSettings>('site-settings')
  const { save, remove } = useCrud('navigation')

  const items = useMemo(() => sortRows(data ?? []), [data])
  const headerItems = useMemo(() => items.filter((i) => inZone(i, 'header')), [items])
  const footerItems = useMemo(() => items.filter((i) => inZone(i, 'footer')), [items])

  const [selectedId, setSelectedId] = useState<number | string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [creatingFor, setCreatingFor] = useState<'header' | 'footer' | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragZone, setDragZone] = useState<'header' | 'footer' | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const selected = useMemo(
    () => (selectedId == null ? null : items.find((i) => String(i.id) === String(selectedId)) ?? null),
    [items, selectedId],
  )

  useEffect(() => {
    if (!selected) return
    setDraft({
      label: selected.label || '',
      href: selected.href || '/',
      target: selected.target === '_blank' ? '_blank' : '_self',
      location: locOf(selected),
      is_visible: visible(selected),
    })
    setCreatingFor(null)
  }, [selected])

  const reorder = useMutation({
    mutationFn: (ids: Array<number | string>) => endpoints.reorder('navigation', ids),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'navigation'] })
      void client.invalidateQueries({ queryKey: ['site'] })
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить порядок')
    },
  })

  const siteName = siteSettings?.site_name || 'Сайт'
  const headerPreview = headerItems.filter(visible)
  const footerPreview = footerItems.filter(visible)

  const openCreate = (zone: 'header' | 'footer') => {
    setSelectedId(null)
    setCreatingFor(zone)
    setDraft({ ...EMPTY_DRAFT, location: zone, href: '/' })
    setError('')
  }

  const openEdit = (item: NavRow) => {
    setCreatingFor(null)
    setSelectedId(item.id)
    setError('')
  }

  const closeEditor = () => {
    setSelectedId(null)
    setCreatingFor(null)
    setDraft(EMPTY_DRAFT)
    setError('')
  }

  const editorOpen = creatingFor != null || selectedId != null

  useEffect(() => {
    if (!editorOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditor()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editorOpen])

  const persistDraft = async (e?: FormEvent) => {
    e?.preventDefault()
    const label = draft.label.trim()
    const href = draft.href.trim() || '/'
    if (!label) {
      setError('Укажите название пункта')
      return
    }
    setBusy(true)
    setError('')
    try {
      const payload = {
        label,
        href,
        target: draft.target,
        location: draft.location,
        is_visible: draft.is_visible ? 1 : 0,
      }
      if (creatingFor) {
        const zoneList = creatingFor === 'header' ? headerItems : footerItems
        const created = (await save.mutateAsync({
          data: { ...payload, sort_order: zoneList.length },
        })) as NavRow
        if (created?.id != null) setSelectedId(created.id)
        setCreatingFor(null)
      } else if (selected) {
        await save.mutateAsync({ data: payload, id: selected.id })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  const toggleVisible = async (item: NavRow) => {
    try {
      await save.mutateAsync({
        data: {
          label: item.label,
          href: item.href,
          target: item.target || '_self',
          location: locOf(item),
          is_visible: visible(item) ? 0 : 1,
        },
        id: item.id,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить видимость')
    }
  }

  const onDuplicate = async (item: NavRow) => {
    try {
      const created = (await save.mutateAsync({
        data: {
          label: `${item.label} (копия)`,
          href: item.href,
          target: item.target || '_self',
          location: locOf(item),
          is_visible: visible(item) ? 1 : 0,
          sort_order: Number(item.sort_order ?? 0) + 1,
        },
      })) as NavRow
      if (created?.id != null) openEdit(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось дублировать')
    }
  }

  const onDelete = async (item: NavRow) => {
    if (!window.confirm(`Удалить «${item.label}»?`)) return
    try {
      await remove.mutateAsync(item.id)
      if (String(selectedId) === String(item.id)) closeEditor()
    } catch {
      /* useCrud alerts */
    }
  }

  const persistZoneOrder = (next: NavRow[]) => {
    void reorder.mutateAsync(next.map((i) => i.id))
  }

  const onDropAt = (zone: 'header' | 'footer', targetId: string) => {
    if (!dragId || dragZone !== zone || dragId === targetId) {
      setDragId(null)
      setDragZone(null)
      return
    }
    const list = (zone === 'header' ? headerItems : footerItems).slice()
    const from = list.findIndex((i) => String(i.id) === dragId)
    const to = list.findIndex((i) => String(i.id) === targetId)
    if (from < 0 || to < 0) {
      setDragId(null)
      setDragZone(null)
      return
    }
    const [row] = list.splice(from, 1)
    list.splice(to, 0, row)
    setDragId(null)
    setDragZone(null)
    persistZoneOrder(list)
  }

  const moveInZone = (zone: 'header' | 'footer', index: number, delta: number) => {
    const list = (zone === 'header' ? headerItems : footerItems).slice()
    const next = index + delta
    if (next < 0 || next >= list.length) return
    const [row] = list.splice(index, 1)
    list.splice(next, 0, row)
    persistZoneOrder(list)
  }

  return (
    <div>
      <AdminPageHero
        title="Навигация"
        hint="Соберите меню шапки и подвала: перетаскивайте пункты, правьте в панели снизу — превью сверху обновляется сразу."
        eyebrow="Оформление"
        accent="teal"
        stats={[
          { label: 'Шапка', value: headerItems.length, tone: 'text-teal-200' },
          { label: 'Подвал', value: footerItems.length, tone: 'text-sky-200' },
          {
            label: 'Скрыто',
            value: items.filter((i) => !visible(i)).length,
            tone: 'text-zinc-400',
          },
        ]}
      />

      {/* Live chrome preview */}
      <GlassPanel className="relative mb-6 overflow-hidden p-0">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 80% at 10% 0%, rgb(45 212 191 / 0.1), transparent 55%), radial-gradient(ellipse 50% 60% at 90% 100%, rgb(56 189 248 / 0.08), transparent 50%)',
          }}
          aria-hidden
        />
        <div className="relative space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            <Eye size={12} aria-hidden />
            Превью на сайте
          </div>

          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/80 shadow-inner">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <span className="shrink-0 font-heading text-sm font-semibold text-zinc-100">{siteName}</span>
              <div className="hidden min-w-0 flex-1 items-center justify-end gap-4 overflow-hidden sm:flex">
                {isLoading ? (
                  <Skeleton className="h-4 w-48" />
                ) : headerPreview.length === 0 ? (
                  <span className="text-xs text-zinc-600">Нет видимых пунктов шапки</span>
                ) : (
                  headerPreview.map((item) => (
                    <button
                      key={`ph-${item.id}`}
                      type="button"
                      onClick={() => openEdit(item)}
                      className="shrink-0 truncate text-xs text-zinc-400 transition hover:text-teal-200"
                      title={item.href}
                    >
                      {item.label}
                    </button>
                  ))
                )}
              </div>
              <Menu size={16} className="text-zinc-500 sm:hidden" aria-hidden />
            </div>
            <div className="flex min-h-[4.5rem] items-center justify-center bg-gradient-to-b from-white/[0.03] to-transparent px-4 py-6">
              <p className="text-center text-xs text-zinc-600">Контент страницы</p>
            </div>
            <div className="border-t border-white/[0.06] bg-black/30 px-4 py-3">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-600">Подвал · ссылки</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {isLoading ? (
                  <Skeleton className="h-3 w-40" />
                ) : footerPreview.length === 0 ? (
                  <span className="text-xs text-zinc-600">Нет видимых пунктов подвала</span>
                ) : (
                  footerPreview.map((item) => (
                    <button
                      key={`pf-${item.id}`}
                      type="button"
                      onClick={() => openEdit(item)}
                      className="text-xs text-zinc-500 underline-offset-2 transition hover:text-sky-200 hover:underline"
                    >
                      {item.label}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>

      <div className={`grid gap-5 lg:grid-cols-2 ${editorOpen ? 'pb-[min(28rem,52dvh)]' : ''}`}>
        <ZoneColumn
          zone="header"
          title="Шапка"
          hint="Горизонтальное меню вверху страницы"
          icon={<PanelTop size={16} />}
          accent="teal"
          items={headerItems}
          loading={isLoading}
          selectedId={selectedId}
          dragId={dragZone === 'header' ? dragId : null}
          reordering={reorder.isPending}
          onAdd={() => openCreate('header')}
          onSelect={openEdit}
          onToggleVisible={toggleVisible}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onDragStart={(id) => {
            setDragId(id)
            setDragZone('header')
          }}
          onDragEnd={() => {
            setDragId(null)
            setDragZone(null)
          }}
          onDropAt={(id) => onDropAt('header', id)}
          onMove={(index, delta) => moveInZone('header', index, delta)}
        />
        <ZoneColumn
          zone="footer"
          title="Подвал"
          hint="Ссылки в футере всех страниц"
          icon={<PanelBottom size={16} />}
          accent="sky"
          items={footerItems}
          loading={isLoading}
          selectedId={selectedId}
          dragId={dragZone === 'footer' ? dragId : null}
          reordering={reorder.isPending}
          onAdd={() => openCreate('footer')}
          onSelect={openEdit}
          onToggleVisible={toggleVisible}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onDragStart={(id) => {
            setDragId(id)
            setDragZone('footer')
          }}
          onDragEnd={() => {
            setDragId(null)
            setDragZone(null)
          }}
          onDropAt={(id) => onDropAt('footer', id)}
          onMove={(index, delta) => moveInZone('footer', index, delta)}
        />
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal aria-labelledby="nav-editor-title">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px] transition"
            aria-label="Закрыть редактор"
            onClick={closeEditor}
          />
          <div className="builder-mobile-sheet relative z-10 mx-auto w-full max-w-3xl rounded-t-2xl border border-white/10 border-b-0 bg-[#121214] shadow-[0_-20px_60px_rgb(0_0_0/0.55)]">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-2xl"
              style={{
                background: 'radial-gradient(ellipse 70% 100% at 50% 0%, rgb(45 212 191 / 0.12), transparent 70%)',
              }}
              aria-hidden
            />
            <div className="relative flex justify-center pt-2.5 pb-1">
              <span className="h-1 w-10 rounded-full bg-white/15" aria-hidden />
            </div>
            <div className="relative flex items-start justify-between gap-3 px-4 pb-3 sm:px-5">
              <div className="min-w-0">
                <AdminSectionLabel>{creatingFor ? 'Новый пункт' : 'Редактирование'}</AdminSectionLabel>
                <p id="nav-editor-title" className="mt-1 truncate text-sm text-zinc-300">
                  {creatingFor === 'header'
                    ? 'Добавление в шапку'
                    : creatingFor === 'footer'
                      ? 'Добавление в подвал'
                      : selected?.label || 'Пункт меню'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>

            <form
              className="relative max-h-[min(70dvh,36rem)] space-y-3 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5"
              onSubmit={(e) => void persistDraft(e)}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm text-zinc-300 sm:col-span-2">
                  <span>Название</span>
                  <input
                    className="w-full"
                    value={draft.label}
                    onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                    placeholder="Например, Документация"
                    autoFocus
                  />
                </label>
                <label className="block space-y-1.5 text-sm text-zinc-300 sm:col-span-2">
                  <span>Ссылка</span>
                  <div className="relative">
                    <Link2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      className="w-full pl-9"
                      value={draft.href}
                      onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
                      placeholder="/docs или https://…"
                    />
                  </div>
                </label>
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span>Где показывать</span>
                  <select
                    className="w-full"
                    value={draft.location}
                    onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value as Loc }))}
                  >
                    <option value="header">Только шапка</option>
                    <option value="footer">Только подвал</option>
                    <option value="both">Шапка и подвал</option>
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span>Открытие</span>
                  <select
                    className="w-full"
                    value={draft.target}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, target: e.target.value as '_self' | '_blank' }))
                    }
                  >
                    <option value="_self">В этой вкладке</option>
                    <option value="_blank">В новой вкладке</option>
                  </select>
                </label>
              </div>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.is_visible}
                  onChange={(e) => setDraft((d) => ({ ...d, is_visible: e.target.checked }))}
                />
                Показывать на сайте
              </label>

              {error ? <p className="text-sm text-rose-300">{error}</p> : null}

              <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                <Button type="submit" className="admin-primary" disabled={busy || save.isPending}>
                  <Check size={16} />
                  {creatingFor ? 'Создать' : 'Сохранить'}
                </Button>
                {!creatingFor && selected ? (
                  <a
                    href={publicHref(draft.href)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex"
                  >
                    <GhostButton type="button">
                      <ExternalLink size={16} />
                      Открыть
                    </GhostButton>
                  </a>
                ) : null}
                <GhostButton type="button" onClick={closeEditor}>
                  Отмена
                </GhostButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ZoneColumn({
  zone,
  title,
  hint,
  icon,
  accent,
  items,
  loading,
  selectedId,
  dragId,
  reordering,
  onAdd,
  onSelect,
  onToggleVisible,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDropAt,
  onMove,
}: {
  zone: 'header' | 'footer'
  title: string
  hint: string
  icon: ReactNode
  accent: 'teal' | 'sky'
  items: NavRow[]
  loading: boolean
  selectedId: number | string | null
  dragId: string | null
  reordering: boolean
  onAdd: () => void
  onSelect: (item: NavRow) => void
  onToggleVisible: (item: NavRow) => void
  onDuplicate: (item: NavRow) => void
  onDelete: (item: NavRow) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDropAt: (id: string) => void
  onMove: (index: number, delta: number) => void
}) {
  const ring =
    accent === 'teal'
      ? 'border-teal-400/25 bg-teal-500/[0.06] text-teal-100'
      : 'border-sky-400/25 bg-sky-500/[0.06] text-sky-100'
  const selectedRing =
    accent === 'teal' ? 'border-teal-400/40 bg-teal-500/10' : 'border-sky-400/40 bg-sky-500/10'

  return (
    <GlassPanel className="flex flex-col overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-lg border p-1.5 ${ring}`}>{icon}</span>
            <div>
              <h2 className="font-heading text-lg text-zinc-50">{title}</h2>
              <p className="text-xs text-zinc-500">{hint}</p>
            </div>
          </div>
        </div>
        <Button type="button" onClick={onAdd} className="shrink-0">
          <Plus size={16} />
          Добавить
        </Button>
      </div>

      <div className="flex-1 space-y-2 p-3">
        {loading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : items.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center transition hover:border-white/20 hover:bg-white/[0.03]"
          >
            <Plus size={20} className="text-zinc-500" />
            <span className="text-sm text-zinc-400">Пока пусто — добавьте первый пункт</span>
          </button>
        ) : (
          items.map((item, index) => {
            const idKey = String(item.id)
            const isSelected = selectedId != null && String(selectedId) === idKey
            const isDragging = dragId === idKey
            const loc = locOf(item)
            const shown = visible(item)
            return (
              <div
                key={idKey}
                draggable
                onDragStart={() => onDragStart(idKey)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropAt(idKey)}
                onDragEnd={onDragEnd}
                className={`group flex items-stretch gap-1 rounded-xl border transition ${
                  isSelected
                    ? selectedRing
                    : isDragging
                      ? 'border-white/20 bg-white/[0.06] opacity-80'
                      : 'border-white/[0.07] bg-black/25 hover:border-white/15 hover:bg-white/[0.03]'
                } ${!shown ? 'opacity-55' : ''}`}
              >
                <div className="flex shrink-0 cursor-grab flex-col items-center justify-center gap-0.5 px-1.5 text-zinc-600 active:cursor-grabbing">
                  <GripVertical size={15} aria-hidden />
                  <button
                    type="button"
                    title="Выше"
                    disabled={index === 0 || reordering}
                    className="rounded p-0.5 hover:bg-white/10 disabled:opacity-25"
                    onClick={() => onMove(index, -1)}
                  >
                    <ChevronUp size={12} aria-hidden />
                    <span className="sr-only">Выше</span>
                  </button>
                  <button
                    type="button"
                    title="Ниже"
                    disabled={index === items.length - 1 || reordering}
                    className="rounded p-0.5 hover:bg-white/10 disabled:opacity-25"
                    onClick={() => onMove(index, 1)}
                  >
                    <ChevronDown size={12} aria-hidden />
                    <span className="sr-only">Ниже</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="min-w-0 flex-1 px-1 py-2.5 text-left"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium text-zinc-100">{item.label}</span>
                    {loc === 'both' ? (
                      <span className="rounded-md border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-100">
                        оба
                      </span>
                    ) : null}
                    {item.target === '_blank' ? (
                      <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        ↗
                      </span>
                    ) : null}
                    {!shown ? (
                      <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        скрыт
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">{item.href}</p>
                </button>

                <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
                  <IconBtn
                    title={shown ? 'Скрыть' : 'Показать'}
                    onClick={() => onToggleVisible(item)}
                  >
                    {shown ? <Eye size={14} /> : <EyeOff size={14} />}
                  </IconBtn>
                  <IconBtn title="Изменить" onClick={() => onSelect(item)}>
                    <Pencil size={14} />
                  </IconBtn>
                  <IconBtn title="Дублировать" onClick={() => void onDuplicate(item)}>
                    <Copy size={14} />
                  </IconBtn>
                  <IconBtn title="Удалить" danger onClick={() => void onDelete(item)}>
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
              </div>
            )
          })
        )}
      </div>

      {items.length > 0 ? (
        <p className="border-t border-white/[0.05] px-4 py-2 text-[11px] text-zinc-600">
          Зона {zone === 'header' ? 'шапки' : 'подвала'}: перетащите за ⋮⋮ или стрелками — порядок
          сохраняется сразу.
        </p>
      ) : null}
    </GlassPanel>
  )
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: ReactNode
  title: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition ${
        danger
          ? 'text-zinc-500 hover:bg-rose-500/15 hover:text-rose-300'
          : 'text-zinc-500 hover:bg-white/10 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}
